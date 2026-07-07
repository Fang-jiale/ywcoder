package ui

import (
	"fmt"
	"strconv"
	"syscall"
	"unsafe"

	"github.com/ywcoder/ywcoder-connect/internal/browser"
	"github.com/ywcoder/ywcoder-connect/internal/config"
	"github.com/ywcoder/ywcoder-connect/internal/logging"
	"github.com/ywcoder/ywcoder-connect/internal/proxy"
)

const (
	wmTrayMessage = 0x8000 + 1
	idTrayIcon    = 1

	menuSettings = 101
	menuExit     = 102

	menuConnectBase = 1000
	menuOpenBase    = 2000

	btnConnect = 1
	btnOK      = 2
	btnCancel  = 3
	btnAdd     = 4
	btnRemove  = 5

	editName       = 10
	editRemoteHost = 11
	editRemotePort = 12
	editToken      = 13
	editLocalPort  = 14
	chkAutoConnect = 15
	listTunnels    = 16
)

var (
	kernel32                  = syscall.NewLazyDLL("kernel32.dll")
	user32                    = syscall.NewLazyDLL("user32.dll")
	shell32                   = syscall.NewLazyDLL("shell32.dll")
	gdi32                     = syscall.NewLazyDLL("gdi32.dll")
	procGetModuleHandleW      = kernel32.NewProc("GetModuleHandleW")
	procRegisterClassExW      = user32.NewProc("RegisterClassExW")
	procCreateWindowExW       = user32.NewProc("CreateWindowExW")
	procDefWindowProcW        = user32.NewProc("DefWindowProcW")
	procShowWindow            = user32.NewProc("ShowWindow")
	procUpdateWindow          = user32.NewProc("UpdateWindow")
	procGetMessageW           = user32.NewProc("GetMessageW")
	procTranslateMessage      = user32.NewProc("TranslateMessage")
	procDispatchMessageW      = user32.NewProc("DispatchMessageW")
	procPostQuitMessage       = user32.NewProc("PostQuitMessage")
	procLoadIconW             = user32.NewProc("LoadIconW")
	procLoadCursorW           = user32.NewProc("LoadCursorW")
	procCreatePopupMenu       = user32.NewProc("CreatePopupMenu")
	procAppendMenuW           = user32.NewProc("AppendMenuW")
	procTrackPopupMenu        = user32.NewProc("TrackPopupMenu")
	procDestroyMenu           = user32.NewProc("DestroyMenu")
	procSetForegroundWindow   = user32.NewProc("SetForegroundWindow")
	procShellNotifyIconW      = shell32.NewProc("Shell_NotifyIconW")
	procGetCursorPos          = user32.NewProc("GetCursorPos")
	procCreateSolidBrush      = gdi32.NewProc("CreateSolidBrush")
	procGetWindowTextLengthW  = user32.NewProc("GetWindowTextLengthW")
	procGetWindowTextW        = user32.NewProc("GetWindowTextW")
	procSetWindowTextW        = user32.NewProc("SetWindowTextW")
	procSendMessageW          = user32.NewProc("SendMessageW")
	procIsDlgButtonChecked    = user32.NewProc("IsDlgButtonChecked")
	procCheckDlgButton        = user32.NewProc("CheckDlgButton")
	procMessageBoxW           = user32.NewProc("MessageBoxW")
	procDestroyWindow         = user32.NewProc("DestroyWindow")
	procEnableWindow          = user32.NewProc("EnableWindow")
)

const (
	lbAddString    = 0x0180
	lbGetCurSel    = 0x0188
	lbSetCurSel    = 0x0186
	lbResetContent = 0x0184
	lbDeleteString = 0x0182
	lbGetCount     = 0x018B
	lbSetItemData  = 0x019A
	lbGetItemData  = 0x0199
	lbnSelChange   = 1
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     syscall.Handle
	hIcon         syscall.Handle
	hCursor       syscall.Handle
	hbrBackground syscall.Handle
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       syscall.Handle
}

type notifyIconData struct {
	cbSize           uint32
	hWnd             syscall.Handle
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            syscall.Handle
	szTip            [128]uint16
	dwState          uint32
	dwStateMask      uint32
	szInfo           [256]uint16
	uVersion         uint32
	szInfoTitle      [64]uint16
	dwInfoFlags      uint32
	guidItem         [16]byte
	hBalloonIcon     syscall.Handle
}

type point struct {
	X, Y int32
}

type tray struct {
	instance     syscall.Handle
	mainWnd      syscall.Handle
	ni           notifyIconData
	menu         syscall.Handle
	proxyServers map[int]*proxy.Server
	currentCfg   config.Config
	logger       *logging.Logger
}

// Tray is the public interface exposed to main.go.
type Tray struct{ t *tray }

type TrayOptions struct {
	InitialConfig config.Config
	Logger        *logging.Logger
}

func NewTray(opts TrayOptions) (*Tray, error) {
	t := &tray{
		currentCfg:   opts.InitialConfig,
		logger:       opts.Logger,
		proxyServers: make(map[int]*proxy.Server),
	}
	if err := t.init(); err != nil {
		return nil, err
	}
	return &Tray{t: t}, nil
}

func (t *tray) init() error {
	hInstance, _, _ := procGetModuleHandleW.Call(0)
	t.instance = syscall.Handle(hInstance)

	className, _ := syscall.UTF16PtrFromString("YwCoderConnectTray")
	wc := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   syscall.NewCallback(t.wndProc),
		hInstance:     t.instance,
		hIcon:         t.loadIcon(32512),   // IDI_APPLICATION
		hCursor:       t.loadCursor(32512), // IDC_ARROW
		hbrBackground: t.createBrush(0xf0f0f0),
		lpszClassName: className,
	}
	if _, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); err != nil && err.(syscall.Errno) != 0 {
		// class may already be registered; ignore
	}

	hWnd, _, err := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		0,
		0,
		0x80000000, 0x80000000,
		0x80000000, 0x80000000,
		0, 0, uintptr(t.instance), 0,
	)
	if hWnd == 0 {
		return fmt.Errorf("create main window: %v", err)
	}
	t.mainWnd = syscall.Handle(hWnd)

	if err := t.addTrayIcon(); err != nil {
		return err
	}
	t.buildMenu()
	return nil
}

func (t *tray) loadIcon(id uintptr) syscall.Handle {
	hIcon, _, _ := procLoadIconW.Call(0, id)
	return syscall.Handle(hIcon)
}

func (t *tray) loadCursor(id uintptr) syscall.Handle {
	hCursor, _, _ := procLoadCursorW.Call(0, id)
	return syscall.Handle(hCursor)
}

func (t *tray) createBrush(color uint32) syscall.Handle {
	brush, _, _ := procCreateSolidBrush.Call(uintptr(color))
	return syscall.Handle(brush)
}

func (t *tray) addTrayIcon() error {
	t.ni = notifyIconData{
		cbSize:           uint32(unsafe.Sizeof(notifyIconData{})),
		hWnd:             t.mainWnd,
		uID:              idTrayIcon,
		uFlags:           0x00000001 | 0x00000002 | 0x00000004, // NIF_MESSAGE | NIF_ICON | NIF_TIP
		uCallbackMessage: wmTrayMessage,
		hIcon:            t.loadIcon(32512),
	}
	t.setTooltip()

	ret, _, _ := procShellNotifyIconW.Call(0, uintptr(unsafe.Pointer(&t.ni))) // NIM_ADD = 0
	if ret == 0 {
		return fmt.Errorf("Shell_NotifyIcon failed")
	}
	return nil
}

func (t *tray) activeCount() int {
	n := 0
	for _, s := range t.proxyServers {
		if s.Active() {
			n++
		}
	}
	return n
}

func (t *tray) setTooltip() {
	active := t.activeCount()
	tip := "YwCoder Connect"
	switch active {
	case 0:
		tip = "YwCoder Connect - 未连接"
	case 1:
		tip = "YwCoder Connect - 1 个连接"
	default:
		tip = fmt.Sprintf("YwCoder Connect - %d 个连接", active)
	}
	utf16, _ := syscall.UTF16FromString(tip)
	copy(t.ni.szTip[:], utf16)
}

func (t *tray) buildMenu() {
	procDestroyMenu.Call(uintptr(t.menu))
	menu, _, _ := procCreatePopupMenu.Call()
	t.menu = syscall.Handle(menu)
}

func (t *tray) refreshMenu() {
	procDestroyMenu.Call(uintptr(t.menu))
	menu, _, _ := procCreatePopupMenu.Call()
	t.menu = syscall.Handle(menu)

	active := t.activeCount()
	status := fmt.Sprintf("状态: %d/%d 已连接", active, len(t.currentCfg.Tunnels))
	t.appendMenu(status, 0x00000001, 0) // MF_STRING | MF_GRAYED
	t.appendMenu("", 0x00000800, 0)     // MF_SEPARATOR

	for i, tunnel := range t.currentCfg.Tunnels {
		srv := t.proxyServers[i]
		active := srv != nil && srv.Active()
		connectText := fmt.Sprintf("连接 %s", tunnel.Name)
		if active {
			connectText = fmt.Sprintf("断开 %s", tunnel.Name)
		}
		t.appendMenu(connectText, 0x00000000, menuConnectBase+uint32(i))
		openFlags := uint32(0x00000000)
		if !active {
			openFlags = 0x00000001 // MF_GRAYED
		}
		t.appendMenu(fmt.Sprintf("打开 %s", tunnel.Name), openFlags, menuOpenBase+uint32(i))
	}
	if len(t.currentCfg.Tunnels) > 0 {
		t.appendMenu("", 0x00000800, 0)
	}
	t.appendMenu("设置...", 0x00000000, menuSettings)
	t.appendMenu("", 0x00000800, 0)
	t.appendMenu("退出", 0x00000000, menuExit)
}

func (t *tray) appendMenu(text string, flags uint32, id uint32) {
	var p *uint16
	if text != "" {
		p, _ = syscall.UTF16PtrFromString(text)
	}
	procAppendMenuW.Call(uintptr(t.menu), uintptr(flags), uintptr(id), uintptr(unsafe.Pointer(p)))
}

func (t *tray) wndProc(hWnd syscall.Handle, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case wmTrayMessage:
		switch lParam {
		case 0x0204, 0x0201: // WM_RBUTTONUP, WM_LBUTTONUP
			t.showMenu()
		}
	case 0x0111: // WM_COMMAND
		t.handleCommand(uint32(wParam & 0xFFFF))
	case 0x0010: // WM_CLOSE
		procPostQuitMessage.Call(0)
	case 0x0002: // WM_DESTROY
		procPostQuitMessage.Call(0)
	default:
		ret, _, _ := procDefWindowProcW.Call(uintptr(hWnd), uintptr(msg), wParam, lParam)
		return ret
	}
	return 0
}

func (t *tray) showMenu() {
	t.refreshMenu()
	procSetForegroundWindow.Call(uintptr(t.mainWnd))
	var pt point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	procTrackPopupMenu.Call(
		uintptr(t.menu),
		0x00000000, // TPM_LEFTALIGN | TPM_TOPALIGN | TPM_LEFTBUTTON
		uintptr(pt.X), uintptr(pt.Y),
		0, uintptr(t.mainWnd), 0,
	)
}

func (t *tray) handleCommand(id uint32) {
	switch {
	case id == menuSettings:
		t.openSettings()
	case id == menuExit:
		t.Stop()
		procPostQuitMessage.Call(0)
	case id >= menuConnectBase && id < menuOpenBase:
		t.toggleConnect(int(id - menuConnectBase))
	case id >= menuOpenBase:
		t.openBrowser(int(id - menuOpenBase))
	}
}

func (t *tray) toggleConnect(index int) {
	if index < 0 || index >= len(t.currentCfg.Tunnels) {
		return
	}
	srv := t.proxyServers[index]
	if srv != nil && srv.Active() {
		t.Disconnect(index)
	} else {
		t.Connect(t.currentCfg.Tunnels[index], index)
	}
}

func (t *tray) Connect(tunnel config.Tunnel, index int) {
	if err := tunnel.Validate(); err != nil {
		msgBox(t.mainWnd, "配置错误", err.Error(), 0x00000030)
		return
	}
	if index < 0 {
		index = t.tunnelIndexByLocalPort(tunnel.LocalPort)
	}
	if index < 0 {
		msgBox(t.mainWnd, "配置错误", "找不到对应的隧道", 0x00000030)
		return
	}
	if srv := t.proxyServers[index]; srv != nil {
		_ = srv.Stop()
	}
	srv, err := proxy.New(tunnel.Name, tunnel.RemoteHost, tunnel.RemotePort, tunnel.LocalPort, t.logger)
	if err != nil {
		msgBox(t.mainWnd, "创建代理失败", err.Error(), 0x00000030)
		return
	}
	if err := srv.Start(); err != nil {
		msgBox(t.mainWnd, "启动代理失败", err.Error(), 0x00000030)
		return
	}
	t.proxyServers[index] = srv
	t.currentCfg.Tunnels[index] = tunnel
	t.setTooltip()
	t.refreshMenu()
	t.updateTray()
	t.logger.Info("connected", "name", tunnel.Name, "remote", tunnel.RemoteURL(), "local", tunnel.LocalAddr())
	_ = browser.Open(tunnel.BrowserURL())
}

func (t *tray) Disconnect(index int) {
	if srv := t.proxyServers[index]; srv != nil {
		_ = srv.Stop()
	}
	t.setTooltip()
	t.refreshMenu()
	t.updateTray()
	if index >= 0 && index < len(t.currentCfg.Tunnels) {
		t.logger.Info("disconnected", "name", t.currentCfg.Tunnels[index].Name)
	} else {
		t.logger.Info("disconnected")
	}
}

func (t *tray) tunnelIndexByLocalPort(port int) int {
	for i, tun := range t.currentCfg.Tunnels {
		if tun.LocalPort == port {
			return i
		}
	}
	return -1
}

func (t *tray) updateTray() {
	procShellNotifyIconW.Call(1, uintptr(unsafe.Pointer(&t.ni))) // NIM_MODIFY
}

func (t *tray) openBrowser(index int) {
	if index < 0 || index >= len(t.currentCfg.Tunnels) {
		return
	}
	srv := t.proxyServers[index]
	if srv != nil && srv.Active() {
		_ = browser.Open(t.currentCfg.Tunnels[index].BrowserURL())
	}
}

func (t *tray) openSettings() {
	result, ok := t.showSettingsDialog()
	if !ok {
		return
	}
	t.currentCfg = result.Config
	if err := t.currentCfg.Save(); err != nil {
		msgBox(t.mainWnd, "保存配置失败", err.Error(), 0x00000010)
		return
	}
	t.logger.Info("config saved", "tunnels", len(t.currentCfg.Tunnels))
	if result.ConnectIndex >= 0 && result.ConnectIndex < len(t.currentCfg.Tunnels) {
		t.Connect(t.currentCfg.Tunnels[result.ConnectIndex], result.ConnectIndex)
	}
}

func (t *tray) Stop() {
	for _, srv := range t.proxyServers {
		if srv != nil {
			_ = srv.Stop()
		}
	}
	procShellNotifyIconW.Call(2, uintptr(unsafe.Pointer(&t.ni))) // NIM_DELETE
}

func (t *tray) Run() int {
	var msg struct {
		hWnd    syscall.Handle
		message uint32
		wParam  uintptr
		lParam  uintptr
		time    uint32
		pt      point
	}
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
	return int(msg.wParam)
}

func (t *tray) Config() config.Config       { return t.currentCfg }
func (t *tray) SetConfig(cfg config.Config) { t.currentCfg = cfg }

func (t *Tray) OpenSettings()               { t.t.openSettings() }
func (t *Tray) Connect(tunnel config.Tunnel, index int) {
	t.t.Connect(tunnel, index)
}
func (t *Tray) Disconnect(index int)        { t.t.Disconnect(index) }
func (t *Tray) Run() int                    { return t.t.Run() }
func (t *Tray) Stop()                       { t.t.Stop() }
func (t *Tray) Config() config.Config       { return t.t.Config() }
func (t *Tray) SetConfig(cfg config.Config) { t.t.SetConfig(cfg) }

func msgBox(hwnd syscall.Handle, title, msg string, flags uint32) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(msg)
	procMessageBoxW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), uintptr(flags))
}

type SettingsResult struct {
	Config        config.Config
	ConnectIndex  int
}

type settingsContext struct {
	tray         *tray
	dlg          syscall.Handle
	listBox      syscall.Handle
	nameEdit     syscall.Handle
	hostEdit     syscall.Handle
	portEdit     syscall.Handle
	tokenEdit    syscall.Handle
	localEdit    syscall.Handle
	currentIndex int
	result       *SettingsResult
	done         chan bool
}

var settingsCtx *settingsContext

func (t *tray) showSettingsDialog() (SettingsResult, bool) {
	var result SettingsResult

	const (
		dlgWidth  = 540
		dlgHeight = 380
	)

	className, _ := syscall.UTF16PtrFromString("YwCoderConnectSettings")
	wc := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   syscall.NewCallback(settingsWndProc),
		hInstance:     t.instance,
		hCursor:       t.loadCursor(32512),
		hbrBackground: t.createBrush(0xf0f0f0),
		lpszClassName: className,
	}
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	title, _ := syscall.UTF16PtrFromString("YwCoder Connect 设置")
	hDlg, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		0x00C00000|0x00080000|0x00020000|0x00010000, // WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX|WS_MAXIMIZEBOX
		0x80000000, 0x80000000,
		uintptr(dlgWidth), uintptr(dlgHeight),
		uintptr(t.mainWnd), 0, uintptr(t.instance), 0,
	)
	if hDlg == 0 {
		return result, false
	}
	defer procDestroyWindow.Call(hDlg)

	listBox := t.createListBox(syscall.Handle(hDlg), 10, 10, 150, dlgHeight-100, listTunnels)

	t.createLabel(syscall.Handle(hDlg), "名称:", 180, 20, 60, 20)
	nameEdit := t.createEdit(syscall.Handle(hDlg), "", 250, 20, 260, 22, editName, false)

	t.createLabel(syscall.Handle(hDlg), "服务器地址:", 180, 55, 80, 20)
	hostEdit := t.createEdit(syscall.Handle(hDlg), "", 270, 55, 240, 22, editRemoteHost, false)

	t.createLabel(syscall.Handle(hDlg), "服务器端口:", 180, 90, 80, 20)
	portEdit := t.createEdit(syscall.Handle(hDlg), "", 270, 90, 100, 22, editRemotePort, false)

	t.createLabel(syscall.Handle(hDlg), "连接令牌:", 180, 125, 80, 20)
	tokenEdit := t.createEdit(syscall.Handle(hDlg), "", 270, 125, 240, 22, editToken, true)

	t.createLabel(syscall.Handle(hDlg), "本地端口:", 180, 160, 80, 20)
	localEdit := t.createEdit(syscall.Handle(hDlg), "", 270, 160, 100, 22, editLocalPort, false)

	t.createCheckbox(syscall.Handle(hDlg), "启动时自动连接", 180, 195, 200, 20, chkAutoConnect)

	t.createButton(syscall.Handle(hDlg), "新增", 20, dlgHeight-60, 70, 26, btnAdd)
	t.createButton(syscall.Handle(hDlg), "删除", 100, dlgHeight-60, 70, 26, btnRemove)
	t.createButton(syscall.Handle(hDlg), "连接", dlgWidth-280, dlgHeight-60, 80, 26, btnConnect)
	t.createButton(syscall.Handle(hDlg), "确定", dlgWidth-190, dlgHeight-60, 80, 26, btnOK)
	t.createButton(syscall.Handle(hDlg), "取消", dlgWidth-100, dlgHeight-60, 80, 26, btnCancel)

	settingsCtx = &settingsContext{
		tray:         t,
		dlg:          syscall.Handle(hDlg),
		listBox:      listBox,
		nameEdit:     nameEdit,
		hostEdit:     hostEdit,
		portEdit:     portEdit,
		tokenEdit:    tokenEdit,
		localEdit:    localEdit,
		currentIndex: -1,
		result:       &result,
		done:         make(chan bool, 1),
	}

	settingsCtx.reloadList()
	if len(t.currentCfg.Tunnels) > 0 {
		settingsCtx.selectIndex(0)
	}

	procShowWindow.Call(hDlg, 1) // SW_SHOWNORMAL
	procUpdateWindow.Call(hDlg)

	var msg struct {
		hWnd    syscall.Handle
		message uint32
		wParam  uintptr
		lParam  uintptr
		time    uint32
		pt      point
	}
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
		select {
		case ok := <-settingsCtx.done:
			return result, ok
		default:
		}
	}
	return result, false
}

func (sc *settingsContext) reloadList() {
	procSendMessageW.Call(uintptr(sc.listBox), lbResetContent, 0, 0)
	for i, tun := range sc.tray.currentCfg.Tunnels {
		text, _ := syscall.UTF16PtrFromString(tun.Name)
		idx, _, _ := procSendMessageW.Call(uintptr(sc.listBox), lbAddString, 0, uintptr(unsafe.Pointer(text)))
		procSendMessageW.Call(uintptr(sc.listBox), lbSetItemData, uintptr(idx), uintptr(i))
	}
}

func (sc *settingsContext) selectIndex(index int) {
	if index < 0 || index >= len(sc.tray.currentCfg.Tunnels) {
		return
	}
	sc.currentIndex = index
	procSendMessageW.Call(uintptr(sc.listBox), lbSetCurSel, uintptr(index), 0)
	sc.loadFields(sc.tray.currentCfg.Tunnels[index])
}

func (sc *settingsContext) loadFields(tun config.Tunnel) {
	setWindowText(sc.nameEdit, tun.Name)
	setWindowText(sc.hostEdit, tun.RemoteHost)
	setWindowText(sc.portEdit, strconv.Itoa(tun.RemotePort))
	setWindowText(sc.tokenEdit, tun.Token)
	setWindowText(sc.localEdit, strconv.Itoa(tun.LocalPort))
	checked := uintptr(0)
	if tun.AutoConnect {
		checked = 1
	}
	procCheckDlgButton.Call(uintptr(sc.dlg), uintptr(chkAutoConnect), checked)
}

func (sc *settingsContext) saveCurrentFields() bool {
	if sc.currentIndex < 0 || sc.currentIndex >= len(sc.tray.currentCfg.Tunnels) {
		return true
	}
	portStr := getWindowText(sc.portEdit)
	localStr := getWindowText(sc.localEdit)
	port, err := strconv.Atoi(portStr)
	if err != nil {
		msgBox(sc.dlg, "输入错误", "服务器端口必须是数字", 0x00000030)
		return false
	}
	localPort, err := strconv.Atoi(localStr)
	if err != nil {
		msgBox(sc.dlg, "输入错误", "本地端口必须是数字", 0x00000030)
		return false
	}
	name := getWindowText(sc.nameEdit)
	if name == "" {
		name = fmt.Sprintf("隧道 %d", sc.currentIndex+1)
	}
	sc.tray.currentCfg.Tunnels[sc.currentIndex] = config.Tunnel{
		Name:        name,
		RemoteHost:  getWindowText(sc.hostEdit),
		RemotePort:  port,
		Token:       getWindowText(sc.tokenEdit),
		LocalPort:   localPort,
		AutoConnect: isChecked(sc.dlg, chkAutoConnect),
	}
	sc.reloadList()
	procSendMessageW.Call(uintptr(sc.listBox), lbSetCurSel, uintptr(sc.currentIndex), 0)
	return true
}

func (sc *settingsContext) addTunnel() {
	if !sc.saveCurrentFields() {
		return
	}
	newPort := 18001
	for _, tun := range sc.tray.currentCfg.Tunnels {
		if tun.LocalPort >= newPort {
			newPort = tun.LocalPort + 1
		}
	}
	sc.tray.currentCfg.Tunnels = append(sc.tray.currentCfg.Tunnels, config.Tunnel{
		Name:      fmt.Sprintf("隧道 %d", len(sc.tray.currentCfg.Tunnels)+1),
		LocalPort: newPort,
	})
	sc.reloadList()
	sc.selectIndex(len(sc.tray.currentCfg.Tunnels) - 1)
}

func (sc *settingsContext) removeTunnel() {
	if sc.currentIndex < 0 || len(sc.tray.currentCfg.Tunnels) == 0 {
		return
	}
	sc.tray.currentCfg.Tunnels = append(sc.tray.currentCfg.Tunnels[:sc.currentIndex], sc.tray.currentCfg.Tunnels[sc.currentIndex+1:]...)
	sc.reloadList()
	if sc.currentIndex >= len(sc.tray.currentCfg.Tunnels) {
		sc.currentIndex = len(sc.tray.currentCfg.Tunnels) - 1
	}
	if sc.currentIndex >= 0 {
		sc.selectIndex(sc.currentIndex)
	} else if len(sc.tray.currentCfg.Tunnels) > 0 {
		sc.selectIndex(0)
	} else {
		sc.currentIndex = -1
		setWindowText(sc.nameEdit, "")
		setWindowText(sc.hostEdit, "")
		setWindowText(sc.portEdit, "")
		setWindowText(sc.tokenEdit, "")
		setWindowText(sc.localEdit, "")
		procCheckDlgButton.Call(uintptr(sc.dlg), uintptr(chkAutoConnect), 0)
	}
}

func settingsWndProc(hWnd syscall.Handle, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case 0x0111: // WM_COMMAND
		id := uint32(wParam & 0xFFFF)
		notifyCode := uint32(wParam >> 16)
		handle := syscall.Handle(lParam)
		if handle == settingsCtx.listBox && notifyCode == lbnSelChange {
			if settingsCtx == nil {
				return 0
			}
			// Capture the clicked index before saveCurrentFields() reloads the list.
			sel, _, _ := procSendMessageW.Call(uintptr(settingsCtx.listBox), lbGetCurSel, 0, 0)
			if sel == ^uintptr(0) {
				return 0
			}
			if settingsCtx.saveCurrentFields() {
				settingsCtx.selectIndex(int(sel))
			}
			return 0
		}
		switch id {
		case btnAdd:
			settingsCtx.addTunnel()
		case btnRemove:
			settingsCtx.removeTunnel()
		case btnConnect, btnOK:
			if settingsCtx == nil {
				return 0
			}
			if !settingsCtx.saveCurrentFields() {
				return 0
			}
			settingsCtx.result.Config = settingsCtx.tray.currentCfg
			settingsCtx.result.ConnectIndex = -1
			if id == btnConnect && settingsCtx.currentIndex >= 0 {
				tun := settingsCtx.tray.currentCfg.Tunnels[settingsCtx.currentIndex]
				if err := tun.Validate(); err != nil {
					msgBox(hWnd, "配置错误", err.Error(), 0x00000030)
					return 0
				}
				settingsCtx.result.ConnectIndex = settingsCtx.currentIndex
			}
			settingsCtx.done <- true
			procDestroyWindow.Call(uintptr(hWnd))
		case btnCancel:
			if settingsCtx != nil {
				settingsCtx.done <- false
			}
			procDestroyWindow.Call(uintptr(hWnd))
		}
	case 0x0010: // WM_CLOSE
		if settingsCtx != nil {
			settingsCtx.done <- false
		}
		procDestroyWindow.Call(uintptr(hWnd))
	default:
		ret, _, _ := procDefWindowProcW.Call(uintptr(hWnd), uintptr(msg), wParam, lParam)
		return ret
	}
	return 0
}

func (t *tray) createListBox(parent syscall.Handle, x, y, w, h int32, id uint32) syscall.Handle {
	class, _ := syscall.UTF16PtrFromString("LISTBOX")
	style := uint32(0x50000000 | 0x00010000 | 0x00200000 | 0x0001) // WS_CHILD|WS_VISIBLE|WS_TABSTOP|WS_VSCROLL|LBS_NOTIFY
	hwnd, _, _ := procCreateWindowExW.Call(
		0x00000200, // WS_EX_CLIENTEDGE
		uintptr(unsafe.Pointer(class)),
		0,
		uintptr(style),
		uintptr(x), uintptr(y), uintptr(w), uintptr(h),
		uintptr(parent), uintptr(id), uintptr(t.instance), 0,
	)
	return syscall.Handle(hwnd)
}

func (t *tray) createLabel(parent syscall.Handle, text string, x, y, w, h int32) syscall.Handle {
	class, _ := syscall.UTF16PtrFromString("STATIC")
	str, _ := syscall.UTF16PtrFromString(text)
	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(class)),
		uintptr(unsafe.Pointer(str)),
		0x50000000, // WS_CHILD|WS_VISIBLE
		uintptr(x), uintptr(y), uintptr(w), uintptr(h),
		uintptr(parent), 0, uintptr(t.instance), 0,
	)
	return syscall.Handle(hwnd)
}

func (t *tray) createEdit(parent syscall.Handle, text string, x, y, w, h int32, id uint32, password bool) syscall.Handle {
	class, _ := syscall.UTF16PtrFromString("EDIT")
	style := uint32(0x50000000 | 0x00010000 | 0x00000080 | 0x00800000) // WS_CHILD|WS_VISIBLE|WS_TABSTOP|ES_AUTOHSCROLL|WS_BORDER
	if password {
		style |= 0x0020 // ES_PASSWORD
	}
	str, _ := syscall.UTF16PtrFromString(text)
	hwnd, _, _ := procCreateWindowExW.Call(
		0x00000200, // WS_EX_CLIENTEDGE
		uintptr(unsafe.Pointer(class)),
		uintptr(unsafe.Pointer(str)),
		uintptr(style),
		uintptr(x), uintptr(y), uintptr(w), uintptr(h),
		uintptr(parent), uintptr(id), uintptr(t.instance), 0,
	)
	return syscall.Handle(hwnd)
}

func (t *tray) createCheckbox(parent syscall.Handle, text string, x, y, w, h int32, id uint32) syscall.Handle {
	class, _ := syscall.UTF16PtrFromString("BUTTON")
	str, _ := syscall.UTF16PtrFromString(text)
	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(class)),
		uintptr(unsafe.Pointer(str)),
		0x50000003, // WS_CHILD|WS_VISIBLE|BS_AUTOCHECKBOX
		uintptr(x), uintptr(y), uintptr(w), uintptr(h),
		uintptr(parent), uintptr(id), uintptr(t.instance), 0,
	)
	return syscall.Handle(hwnd)
}

func (t *tray) createButton(parent syscall.Handle, text string, x, y, w, h int32, id uint32) syscall.Handle {
	class, _ := syscall.UTF16PtrFromString("BUTTON")
	str, _ := syscall.UTF16PtrFromString(text)
	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(class)),
		uintptr(unsafe.Pointer(str)),
		0x50010000, // WS_CHILD|WS_VISIBLE|WS_TABSTOP
		uintptr(x), uintptr(y), uintptr(w), uintptr(h),
		uintptr(parent), uintptr(id), uintptr(t.instance), 0,
	)
	return syscall.Handle(hwnd)
}

func getWindowText(hwnd syscall.Handle) string {
	length, _, _ := procGetWindowTextLengthW.Call(uintptr(hwnd))
	if length == 0 {
		return ""
	}
	buf := make([]uint16, length+1)
	procGetWindowTextW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return syscall.UTF16ToString(buf)
}

func setWindowText(hwnd syscall.Handle, text string) {
	p, _ := syscall.UTF16PtrFromString(text)
	procSetWindowTextW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(p)))
}

func isChecked(hwnd syscall.Handle, id uint32) bool {
	ret, _, _ := procIsDlgButtonChecked.Call(uintptr(hwnd), uintptr(id))
	return ret == 1
}
