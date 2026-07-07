//go:build linux

package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/ywcoder/ywcoder-connect/internal/browser"
	"github.com/ywcoder/ywcoder-connect/internal/config"
	"github.com/ywcoder/ywcoder-connect/internal/logging"
	"github.com/ywcoder/ywcoder-connect/internal/proxy"
)

var version = "dev"

func main() {
	var (
		remoteHost = flag.String("remote-host", "", "远程服务器地址")
		remotePort = flag.Int("remote-port", 0, "远程服务器端口")
		token      = flag.String("token", "", "连接令牌")
		localPort  = flag.Int("local-port", 0, "本地监听端口")
		noBrowser  = flag.Bool("no-browser", false, "不自动打开浏览器")
	)
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		cfg = config.Default()
	}

	logger, logFile, err := logging.Init("")
	if err != nil {
		fmt.Fprintf(os.Stderr, "初始化日志失败: %v\n", err)
		os.Exit(1)
	}
	defer logFile.Close()

	logger.Info("YwCoder Connect CLI started", "version", version)

	tunnels := selectTunnels(cfg, remoteHost, remotePort, token, localPort)
	if len(tunnels) == 0 {
		fmt.Fprintln(os.Stderr, "没有可用的隧道配置")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "请创建或编辑配置文件:")
		fmt.Fprintln(os.Stderr, configExample())
		fmt.Fprintf(os.Stderr, "配置文件路径: %s\n", configPath())
		os.Exit(1)
	}

	servers := make([]*proxy.Server, 0, len(tunnels))
	for _, t := range tunnels {
		if err := t.Validate(); err != nil {
			fmt.Fprintf(os.Stderr, "隧道 [%s] 配置错误: %v\n", t.Name, err)
			os.Exit(1)
		}
		srv, err := proxy.New(t.Name, t.RemoteHost, t.RemotePort, t.LocalPort, logger)
		if err != nil {
			logger.Error("create proxy", "name", t.Name, "error", err)
			os.Exit(1)
		}
		if err := srv.Start(); err != nil {
			logger.Error("start proxy", "name", t.Name, "error", err)
			os.Exit(1)
		}
		servers = append(servers, srv)
		fmt.Printf("代理已启动 [%s]: %s -> %s\n", t.Name, t.LocalAddr(), t.RemoteURL())
		logger.Info("connected", "name", t.Name, "remote", t.RemoteURL(), "local", t.LocalAddr())
	}
	defer func() {
		for _, srv := range servers {
			_ = srv.Stop()
		}
	}()

	if !*noBrowser && len(tunnels) > 0 {
		url := tunnels[0].BrowserURL()
		fmt.Printf("本地地址: %s\n", url)
		if err := browser.Open(url); err != nil {
			logger.Error("open browser", "error", err)
			fmt.Fprintf(os.Stderr, "打开浏览器失败: %v\n", err)
		}
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	logger.Info("shutting down")
}

func selectTunnels(cfg config.Config, remoteHost *string, remotePort *int, token *string, localPort *int) []config.Tunnel {
	flagsUsed := *remoteHost != "" || *remotePort != 0 || *token != "" || *localPort != 0
	if flagsUsed {
		base := cfg.Tunnels[0]
		if *remoteHost != "" {
			base.RemoteHost = *remoteHost
		}
		if *remotePort != 0 {
			base.RemotePort = *remotePort
		}
		if *token != "" {
			base.Token = *token
		}
		if *localPort != 0 {
			base.LocalPort = *localPort
		}
		return []config.Tunnel{base}
	}

	var out []config.Tunnel
	for _, t := range cfg.Tunnels {
		if t.AutoConnect {
			out = append(out, t)
		}
	}
	if len(out) == 0 && len(cfg.Tunnels) > 0 {
		out = append(out, cfg.Tunnels[0])
	}
	return out
}

func configExample() string {
	return `{
  "tunnels": [
    {
      "name": "服务器 A",
      "remoteHost": "192.168.1.100",
      "remotePort": 8001,
      "token": "your-secret-token",
      "localPort": 18001,
      "autoConnect": true
    },
    {
      "name": "服务器 B",
      "remoteHost": "192.168.1.101",
      "remotePort": 8001,
      "token": "another-token",
      "localPort": 18002,
      "autoConnect": false
    }
  ]
}`
}

func configPath() string {
	base, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return base + "/YwCoder Connect/config.json"
}
