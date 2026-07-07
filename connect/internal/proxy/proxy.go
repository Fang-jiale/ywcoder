package proxy

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	"github.com/ywcoder/ywcoder-connect/internal/logging"
)

type Server struct {
	mu        sync.RWMutex
	listener  net.Listener
	proxy     *httputil.ReverseProxy
	name      string
	localPort int
	remoteURL string
	active    bool
	logger    *logging.Logger
}

func New(name, remoteHost string, remotePort, localPort int, logger *logging.Logger) (*Server, error) {
	target, err := url.Parse(fmt.Sprintf("http://%s:%d", remoteHost, remotePort))
	if err != nil {
		return nil, fmt.Errorf("parse remote url: %w", err)
	}
	rp := httputil.NewSingleHostReverseProxy(target)
	rp.Director = func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		if _, ok := req.Header["User-Agent"]; !ok {
			req.Header.Set("User-Agent", "")
		}
	}
	rp.ModifyResponse = func(resp *http.Response) error {
		location := resp.Header.Get("Location")
		if location != "" {
			if u, err := url.Parse(location); err == nil {
				if u.Host == target.Host {
					u.Scheme = "http"
					u.Host = fmt.Sprintf("127.0.0.1:%d", localPort)
					resp.Header.Set("Location", u.String())
				}
			}
		}
		return nil
	}
	rp.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
		logger.Error("proxy error", "error", err, "path", req.URL.Path)
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, "无法连接到远程服务器: %v", err)
	}
	return &Server{
		proxy:     rp,
		name:      name,
		localPort: localPort,
		remoteURL: target.String(),
		logger:    logger,
	}, nil
}

func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active {
		return nil
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", s.localPort))
	if err != nil {
		return fmt.Errorf("监听本地端口 %d 失败: %w", s.localPort, err)
	}
	s.listener = ln
	s.active = true
	s.logger.Info("proxy started", "name", s.name, "local", ln.Addr().String(), "remote", s.remoteURL)
	go func() {
		if err := http.Serve(ln, s.proxy); err != nil && !strings.Contains(err.Error(), "use of closed network connection") {
			s.logger.Error("proxy server stopped", "error", err)
		}
	}()
	return nil
}

func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.active {
		return nil
	}
	if s.listener != nil {
		if err := s.listener.Close(); err != nil {
			return err
		}
	}
	s.active = false
	s.logger.Info("proxy stopped", "name", s.name)
	return nil
}

func (s *Server) Active() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.active
}

func (s *Server) LocalAddr() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return fmt.Sprintf("127.0.0.1:%d", s.localPort)
}
