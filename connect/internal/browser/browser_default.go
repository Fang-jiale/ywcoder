//go:build !windows && !linux

package browser

import (
	"fmt"
	"runtime"
)

func Open(url string) error {
	return fmt.Errorf("browser open not implemented on %s", runtime.GOOS)
}
