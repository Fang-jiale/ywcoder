//go:build linux

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
	cmd := exec.Command("xdg-open", url)
	return cmd.Start()
}
