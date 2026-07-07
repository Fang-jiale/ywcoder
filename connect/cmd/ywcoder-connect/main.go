//go:build windows

package main

import (
	"fmt"
	"os"

	"github.com/ywcoder/ywcoder-connect/internal/config"
	"github.com/ywcoder/ywcoder-connect/internal/logging"
	"github.com/ywcoder/ywcoder-connect/internal/ui"
)

var version = "dev"

func main() {
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

	logger.Info("YwCoder Connect started", "version", version)

	tray, err := ui.NewTray(ui.TrayOptions{InitialConfig: cfg, Logger: logger})
	if err != nil {
		logger.Error("create tray", "error", err)
		os.Exit(1)
	}
	defer tray.Stop()

	if t, ok := cfg.FirstAutoConnect(); ok {
		tray.Connect(t, -1)
	} else if !hasAnyConfiguredTunnel(cfg) {
		tray.OpenSettings()
	}

	os.Exit(tray.Run())
}

func hasAnyConfiguredTunnel(cfg config.Config) bool {
	for _, t := range cfg.Tunnels {
		if t.RemoteHost != "" && t.Token != "" && t.RemotePort != 0 {
			return true
		}
	}
	return false
}
