package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Tunnel represents a single remote-to-local port forwarding configuration.
type Tunnel struct {
	Name        string `json:"name,omitempty"`
	RemoteHost  string `json:"remoteHost"`
	RemotePort  int    `json:"remotePort"`
	Token       string `json:"token"`
	LocalPort   int    `json:"localPort"`
	AutoConnect bool   `json:"autoConnect"`
}

// Config is the persisted application configuration.
type Config struct {
	Tunnels []Tunnel `json:"tunnels"`

	// Legacy single-tunnel fields are kept for backward compatibility.
	// On load, if Tunnels is empty and any legacy field is present, a single
	// Tunnel is created from them.
	RemoteHost  string `json:"remoteHost,omitempty"`
	RemotePort  int    `json:"remotePort,omitempty"`
	Token       string `json:"token,omitempty"`
	LocalPort   int    `json:"localPort,omitempty"`
	AutoConnect bool   `json:"autoConnect,omitempty"`

	WindowX      int `json:"windowX,omitempty"`
	WindowY      int `json:"windowY,omitempty"`
	WindowWidth  int `json:"windowWidth,omitempty"`
	WindowHeight int `json:"windowHeight,omitempty"`
}

func Default() Config {
	return Config{
		Tunnels: []Tunnel{
			{
				Name:      "默认",
				LocalPort: 18001,
			},
		},
	}
}

func appDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "YwCoder Connect"), nil
}

func configPath() (string, error) {
	dir, err := appDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

func Load() (Config, error) {
	cfg := Default()
	path, err := configPath()
	if err != nil {
		return cfg, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	cfg.migrateLegacy()
	cfg.ensureDefaults()
	return cfg, nil
}

func (c *Config) migrateLegacy() {
	if len(c.Tunnels) > 0 {
		return
	}
	legacyUsed := c.RemoteHost != "" || c.Token != "" || c.RemotePort != 0 || c.LocalPort != 0 || c.AutoConnect
	if !legacyUsed {
		return
	}
	localPort := c.LocalPort
	if localPort == 0 {
		localPort = 18001
	}
	name := c.RemoteHost
	if name == "" {
		name = "默认"
	}
	c.Tunnels = []Tunnel{
		{
			Name:        name,
			RemoteHost:  c.RemoteHost,
			RemotePort:  c.RemotePort,
			Token:       c.Token,
			LocalPort:   localPort,
			AutoConnect: c.AutoConnect,
		},
	}
	c.RemoteHost = ""
	c.RemotePort = 0
	c.Token = ""
	c.LocalPort = 0
	c.AutoConnect = false
}

func (c *Config) ensureDefaults() {
	if len(c.Tunnels) == 0 {
		c.Tunnels = Default().Tunnels
	}
	for i := range c.Tunnels {
		if c.Tunnels[i].LocalPort == 0 {
			c.Tunnels[i].LocalPort = 18001 + i
		}
		if c.Tunnels[i].Name == "" {
			c.Tunnels[i].Name = fmt.Sprintf("隧道 %d", i+1)
		}
	}
}

func (c Config) Save() error {
	path, err := configPath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (t Tunnel) Validate() error {
	if t.RemoteHost == "" {
		return errors.New("服务器地址不能为空")
	}
	if t.RemotePort < 1 || t.RemotePort > 65535 {
		return errors.New("服务器端口必须在 1-65535 之间")
	}
	if t.LocalPort < 1 || t.LocalPort > 65535 {
		return errors.New("本地端口必须在 1-65535 之间")
	}
	if t.Token == "" {
		return errors.New("连接令牌不能为空")
	}
	return nil
}

func (t Tunnel) LocalAddr() string {
	return fmt.Sprintf("127.0.0.1:%d", t.LocalPort)
}

func (t Tunnel) RemoteURL() string {
	return fmt.Sprintf("http://%s:%d", t.RemoteHost, t.RemotePort)
}

func (t Tunnel) BrowserURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d?tkn=%s", t.LocalPort, t.Token)
}

func (c Config) FirstAutoConnect() (Tunnel, bool) {
	for _, t := range c.Tunnels {
		if t.AutoConnect {
			return t, true
		}
	}
	return Tunnel{}, false
}
