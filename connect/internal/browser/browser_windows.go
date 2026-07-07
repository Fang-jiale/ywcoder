//go:build windows

package browser

import (
	"fmt"
	"os/exec"
	"strings"
)

func Open(url string) error {
	url = strings.TrimSpace(url)
	if url == "" {
		return fmt.Errorf("url is empty")
	}
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	if err := cmd.Start(); err != nil {
		fallback := exec.Command("cmd", "/c", "start", "", url)
		return fallback.Start()
	}
	return nil
}
