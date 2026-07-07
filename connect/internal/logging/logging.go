package logging

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Logger struct {
	mu sync.Mutex
	f  *os.File
}

func Init(appDataDir string) (*Logger, *os.File, error) {
	if appDataDir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return nil, nil, fmt.Errorf("get user config dir: %w", err)
		}
		appDataDir = filepath.Join(base, "YwCoder Connect")
	}
	if err := os.MkdirAll(appDataDir, 0755); err != nil {
		return nil, nil, fmt.Errorf("create app data dir: %w", err)
	}
	path := filepath.Join(appDataDir, "connect.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, nil, fmt.Errorf("open log file: %w", err)
	}
	return &Logger{f: f}, f, nil
}

func (l *Logger) log(level string, msg string, fields ...any) {
	record := map[string]any{
		"time":  time.Now().UTC().Format(time.RFC3339),
		"level": level,
		"msg":   msg,
	}
	for i := 0; i+1 < len(fields); i += 2 {
		key, ok := fields[i].(string)
		if !ok {
			key = fmt.Sprintf("key%d", i)
		}
		record[key] = fields[i+1]
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	enc := json.NewEncoder(l.f)
	_ = enc.Encode(record)
}

func (l *Logger) Info(msg string, fields ...any) {
	l.log("INFO", msg, fields...)
}

func (l *Logger) Error(msg string, fields ...any) {
	l.log("ERROR", msg, fields...)
}
