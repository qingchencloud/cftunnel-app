import { useState, useEffect, useCallback } from 'react'
import './style.css'
import { CheckInstall, GetStatus, GetRoutes, TunnelUp, TunnelDown, RunCommand, GetRelayStatus, GetRelayRules, RelayUp, RelayDown, RelayAddRule, RelayRemoveRule, RelayInit, RelayInstallService, RelayUninstallService, GetRelayLogs, RelayServerSetup, SelectDirectory, RelayCheck, GetAppVersion, CheckAppUpdate, StartQuick, QuickStop, QuickRunning, QuickURL, Diagnose } from '../wailsjs/go/main/App'
import { IconDashboard, IconZap, IconRoute, IconTerminal, IconAlert, IconPlay, IconStop, IconRefresh, IconPlus, IconTrash, IconSend, IconClear, IconRelay, IconServer, IconLog, IconSetup, IconInfo, IconDiagnose } from './Icons'
import { BrowserOpenURL } from '../wailsjs/runtime/runtime'

type Route = { name: string; hostname: string; service: string }
type RelayRule = { name: string; proto: string; local_port: number; remote_port: number; domain: string }
type RelayStatus = { server: string; running: boolean; pid: string; rules: number }
type Page = 'dashboard' | 'quick' | 'routes' | 'diagnose' | 'terminal' | 'relay-dashboard' | 'relay-rules' | 'relay-logs' | 'relay-setup' | 'about'

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [version, setVersion] = useState('')
  const [installed, setInstalled] = useState(false)
  const [status, setStatus] = useState('')
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  // Relay 状态
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({ server: '', running: false, pid: '', rules: 0 })
  const [relayRules, setRelayRules] = useState<RelayRule[]>([])

  const refresh = useCallback(async () => {
    const info = await CheckInstall()
    setInstalled(info.installed)
    setVersion(info.version || '')
    if (info.installed) {
      setStatus(await GetStatus())
      setRoutes(await GetRoutes() || [])
      const rs = await GetRelayStatus()
      if (rs) setRelayStatus(rs)
      setRelayRules(await GetRelayRules() || [])
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 全局拦截外部链接，用系统浏览器打开
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault()
        BrowserOpenURL(href)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const isRunning = status.includes('运行中')

  const renderPage = () => {
    if (!installed) return <NotInstalled />
    switch (page) {
      case 'dashboard': return <Dashboard status={status} isRunning={isRunning} routes={routes} loading={loading} setLoading={setLoading} refresh={refresh} />
      case 'quick': return <QuickMode />
      case 'routes': return <Routes routes={routes} refresh={refresh} />
      case 'diagnose': return <DiagnosePage />
      case 'relay-dashboard': return <RelayDashboard status={relayStatus} rules={relayRules} loading={loading} setLoading={setLoading} refresh={refresh} />
      case 'relay-rules': return <RelayRules rules={relayRules} refresh={refresh} />
      case 'relay-logs': return <RelayLogsPage />
      case 'relay-setup': return <RelaySetupPage />
      case 'terminal': return <Terminal />
      case 'about': return <AboutPage version={version} />
    }
  }

  return (
    <>
      <div className="titlebar">cftunnel</div>
      <div className="app">
        <Sidebar page={page} setPage={setPage} version={version} />
        <div className="main">{renderPage()}</div>
      </div>
    </>
  )
}

function Sidebar({ page, setPage, version }: { page: Page; setPage: (p: Page) => void; version: string }) {
  const NavBtn = ({ id, icon, label }: { id: Page; icon: JSX.Element; label: string }) => (
    <button className={`nav-item${page === id ? ' active' : ''}`} onClick={() => setPage(id)}>
      {icon} {label}
    </button>
  )
  return (
    <div className="sidebar">
      <div className="sidebar-header">cf<span>tunnel</span></div>
      <div className="sidebar-nav">
        <div className="sidebar-group">Cloud 模式</div>
        <NavBtn id="dashboard" icon={<IconDashboard />} label="仪表盘" />
        <NavBtn id="quick" icon={<IconZap />} label="免域名模式" />
        <NavBtn id="routes" icon={<IconRoute />} label="路由管理" />
        <NavBtn id="diagnose" icon={<IconDiagnose />} label="链路诊断" />
        <div className="sidebar-group">Relay 模式</div>
        <NavBtn id="relay-dashboard" icon={<IconRelay />} label="中继面板" />
        <NavBtn id="relay-rules" icon={<IconServer />} label="规则管理" />
        <NavBtn id="relay-logs" icon={<IconLog />} label="中继日志" />
        <NavBtn id="relay-setup" icon={<IconSetup />} label="服务端部署" />
        <div className="sidebar-group">通用</div>
        <NavBtn id="terminal" icon={<IconTerminal />} label="终端" />
        <NavBtn id="about" icon={<IconInfo />} label="关于我们" />
      </div>
      <div className="sidebar-footer">{version || 'cftunnel'}</div>
    </div>
  )
}

function NotInstalled() {
  return (
    <div className="empty">
      <div className="empty-icon"><IconAlert /></div>
      <p>未检测到 cftunnel CLI</p>
      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
        请先安装: curl -fsSL https://raw.githubusercontent.com/qingchencloud/cftunnel/main/install.sh | bash
      </p>
    </div>
  )
}

function Dashboard({ status, isRunning, routes, loading, setLoading, refresh }: {
  status: string; isRunning: boolean; routes: Route[]; loading: boolean; setLoading: (b: boolean) => void; refresh: () => Promise<void>
}) {
  const handleUp = async () => { setLoading(true); await TunnelUp(); await refresh(); setLoading(false) }
  const handleDown = async () => { setLoading(true); await TunnelDown(); await refresh(); setLoading(false) }

  return (
    <>
      <div className="page-title">仪表盘</div>
      <div className="card">
        <div className="card-title">隧道状态</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span className={`status-dot ${isRunning ? 'running' : 'stopped'}`} />
          <span>{isRunning ? '运行中' : '已停止'}</span>
        </div>
        <div className="terminal" style={{ marginBottom: 16 }}>{status}</div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleUp} disabled={loading || isRunning}>
            {loading ? <span className="spinner" /> : <IconPlay />} 启动
          </button>
          <button className="btn btn-danger" onClick={handleDown} disabled={loading || !isRunning}>
            <IconStop /> 停止
          </button>
          <button className="btn btn-outline" onClick={refresh}><IconRefresh /> 刷新</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">路由 ({routes.length})</div>
        {routes.length === 0 ? <div style={{ color: 'var(--text2)', fontSize: 14 }}>暂无路由</div> : (
          <table className="route-table">
            <thead><tr><th>名称</th><th>域名</th><th>服务</th></tr></thead>
            <tbody>{routes.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.hostname}</td><td>{r.service}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

function QuickMode() {
  const [port, setPort] = useState('3000')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const checkStatus = useCallback(async () => {
    const r = await QuickRunning()
    setRunning(r)
    if (r) {
      const u = await QuickURL()
      if (u) setUrl(u)
    } else {
      setUrl('')
    }
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])

  const start = async () => {
    setLoading(true)
    setError('')
    setUrl('')
    const result = await StartQuick(port)
    if (result.err) {
      setError(result.err)
      setLoading(false)
      return
    }
    if (result.url) {
      setUrl(result.url)
    }
    await checkStatus()
    setLoading(false)
    // 如果启动成功但还没拿到 URL，自动轮询
    if (!result.url) {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000))
        const u = await QuickURL()
        if (u) { setUrl(u); break }
        const r2 = await QuickRunning()
        if (!r2) { setError('cloudflared 启动后异常退出'); break }
      }
    }
  }

  const stop = async () => {
    setLoading(true)
    setError('')
    await QuickStop()
    await checkStatus()
    setLoading(false)
  }

  const copyUrl = () => {
    if (url) navigator.clipboard.writeText(url)
  }

  return (
    <>
      <div className="page-title">免域名模式</div>
      <div className="card">
        <div className="card-title">快速启动</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
          零配置生成 *.trycloudflare.com 临时公网地址，后台持续运行直到手动停止
        </p>
        <div className="input-row" style={{ marginBottom: 16 }}>
          <input className="input" style={{ width: 120 }} value={port}
            onChange={e => setPort(e.target.value)} placeholder="端口" disabled={running} />
          <button className="btn btn-primary" onClick={start} disabled={loading || running}>
            {loading && !running ? <span className="spinner" /> : <IconZap size={16} />} 启动
          </button>
          <button className="btn btn-danger" onClick={stop} disabled={loading || !running}>
            {loading && running ? <span className="spinner" /> : <IconStop />} 停止
          </button>
          <button className="btn btn-outline" onClick={checkStatus}><IconRefresh /> 刷新</button>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      </div>
      {/* 运行状态卡片 */}
      <div className="card">
        <div className="card-title">运行状态</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span className={`status-dot ${running ? 'running' : 'stopped'}`} />
          <span>{running ? '隧道运行中' : '未运行'}</span>
        </div>
        {running && url && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>公网地址</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6,
                fontSize: 13, color: 'var(--accent2)', wordBreak: 'break-all' }}>{url}</code>
              <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={copyUrl}>复制</button>
              <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => BrowserOpenURL(url)}>打开</button>
            </div>
          </div>
        )}
        {running && !url && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>域名获取中，请稍候...</span>
            <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={checkStatus}><IconRefresh /> 刷新</button>
          </div>
        )}
      </div>
    </>
  )
}

function Routes({ routes, refresh }: { routes: Route[]; refresh: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [port, setPort] = useState('')
  const [domain, setDomain] = useState('')
  const [output, setOutput] = useState('')

  const addRoute = async () => {
    if (!name || !port || !domain) return
    const result = await RunCommand(`add ${name} ${port} --domain ${domain}`)
    setOutput(result)
    await refresh()
    setName(''); setPort(''); setDomain('')
  }

  const removeRoute = async (n: string) => {
    const result = await RunCommand(`remove ${n}`)
    setOutput(result)
    await refresh()
  }

  return (
    <>
      <div className="page-title">路由管理</div>
      <div className="card">
        <div className="card-title">添加路由</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="input" style={{ width: 120 }} value={name} onChange={e => setName(e.target.value)} placeholder="名称" />
          <input className="input" style={{ width: 80 }} value={port} onChange={e => setPort(e.target.value)} placeholder="端口" />
          <input className="input" style={{ flex: 1, minWidth: 200 }} value={domain} onChange={e => setDomain(e.target.value)} placeholder="域名 (如 app.example.com)" />
          <button className="btn btn-primary" onClick={addRoute}><IconPlus /> 添加</button>
        </div>
        {output && <div className="terminal">{output}</div>}
      </div>
      <div className="card">
        <div className="card-title">当前路由 ({routes.length})</div>
        {routes.length === 0 ? <div style={{ color: 'var(--text2)', fontSize: 14 }}>暂无路由</div> : (
          <table className="route-table">
            <thead><tr><th>名称</th><th>域名</th><th>服务</th><th>操作</th></tr></thead>
            <tbody>{routes.map(r => (
              <tr key={r.name}>
                <td>{r.name}</td><td>{r.hostname}</td><td>{r.service}</td>
                <td><button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => removeRoute(r.name)}><IconTrash /> 删除</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

function RelayDashboard({ status, rules, loading, setLoading, refresh }: {
  status: RelayStatus; rules: RelayRule[]; loading: boolean; setLoading: (b: boolean) => void; refresh: () => Promise<void>
}) {
  const [server, setServer] = useState(status.server || '')
  const [token, setToken] = useState('')
  const [initOutput, setInitOutput] = useState('')
  const [svcOutput, setSvcOutput] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{
    server: string; server_ok: boolean; server_latency_ms: number
    frpc_running: boolean; frpc_pid: number
    rules: { name: string; proto: string; local_port: number; remote_port: number; local_ok: boolean; remote_ok: boolean; latency_ms: number; local_err: string; remote_err: string }[]
    total: number; passed: number; failed: number
  } | null>(null)

  const handleUp = async () => { setLoading(true); await RelayUp(); await refresh(); setLoading(false) }
  const handleDown = async () => { setLoading(true); await RelayDown(); await refresh(); setLoading(false) }

  const handleInit = async () => {
    if (!server || !token) return
    const result = await RelayInit(server, token)
    setInitOutput(result)
    await refresh()
  }

  const handleInstall = async () => {
    const result = await RelayInstallService()
    setSvcOutput(result)
  }

  const handleUninstall = async () => {
    const result = await RelayUninstallService()
    setSvcOutput(result)
  }

  const handleCheck = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const r = await RelayCheck()
      setCheckResult(r)
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="page-title">中继面板</div>
      {/* 初始化配置 */}
      <div className="card">
        <div className="card-title">服务器配置</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="input" style={{ flex: 1, minWidth: 180 }} value={server} onChange={e => setServer(e.target.value)} placeholder="服务器地址 (如 1.2.3.4:7000)" />
          <input className="input" style={{ flex: 1, minWidth: 140 }} type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="鉴权 Token" />
          <button className="btn btn-primary" onClick={handleInit}><IconRefresh /> 保存</button>
        </div>
        {status.server && !token && (
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>当前服务器: {status.server}</div>
        )}
        {initOutput && <div className="terminal" style={{ marginTop: 8 }}>{initOutput}</div>}
      </div>
      {/* 中继状态 */}
      <div className="card">
        <div className="card-title">中继状态</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span className={`status-dot ${status.running ? 'running' : 'stopped'}`} />
          <span>{status.running ? '运行中' : '未运行'}</span>
          {status.pid && <span style={{ fontSize: 12, color: 'var(--text2)' }}>PID: {status.pid}</span>}
        </div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleUp} disabled={loading || status.running}>
            {loading ? <span className="spinner" /> : <IconPlay />} 启动
          </button>
          <button className="btn btn-danger" onClick={handleDown} disabled={loading || !status.running}>
            <IconStop /> 停止
          </button>
          <button className="btn btn-outline" onClick={refresh}><IconRefresh /> 刷新</button>
        </div>
      </div>
      {/* 系统服务 */}
      <div className="card">
        <div className="card-title">系统服务</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>注册为系统服务后，中继将开机自启</p>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleInstall}>注册服务</button>
          <button className="btn btn-danger" onClick={handleUninstall}>卸载服务</button>
        </div>
        {svcOutput && <div className="terminal" style={{ marginTop: 8 }}>{svcOutput}</div>}
      </div>
      {/* 链路检测 */}
      <div className="card">
        <div className="card-title">链路检测</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>检测服务器连通性、本地服务和远程穿透端口状态</p>
        <button className="btn btn-primary" onClick={handleCheck} disabled={checking}>
          {checking ? <span className="spinner" /> : <IconRefresh />} {checking ? '检测中...' : '开始检测'}
        </button>
        {checkResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <span>服务器: {checkResult.server} {checkResult.server_ok
                ? <span style={{ color: 'var(--green)' }}>✓ 可达 ({checkResult.server_latency_ms}ms)</span>
                : <span style={{ color: 'var(--red)' }}>✗ 不可达</span>}</span>
              <span>frpc: {checkResult.frpc_running
                ? <span style={{ color: 'var(--green)' }}>运行中 (PID: {checkResult.frpc_pid})</span>
                : <span style={{ color: 'var(--red)' }}>未运行</span>}</span>
            </div>
            {checkResult.rules && checkResult.rules.length > 0 ? (
              <>
                <table className="route-table">
                  <thead><tr><th>规则</th><th>协议</th><th>本地端口</th><th>远程端口</th><th>本地服务</th><th>远程穿透</th><th>延迟</th></tr></thead>
                  <tbody>{checkResult.rules.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td><span className={`relay-badge ${r.proto}`}>{r.proto}</span></td>
                      <td>{r.local_port}</td>
                      <td>{r.remote_port || '-'}</td>
                      <td>{r.local_ok
                        ? <span style={{ color: 'var(--green)' }}>✓</span>
                        : <span style={{ color: 'var(--red)' }}>✗ {r.local_err}</span>}</td>
                      <td>{r.remote_port > 0
                        ? (r.remote_ok
                          ? <span style={{ color: 'var(--green)' }}>✓</span>
                          : <span style={{ color: 'var(--red)' }}>✗ {r.remote_err}</span>)
                        : '-'}</td>
                      <td>{r.latency_ms > 0 ? `${r.latency_ms}ms` : '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
                  结果: {checkResult.total} 条规则,{' '}
                  <span style={{ color: 'var(--green)' }}>{checkResult.passed} 通</span> /{' '}
                  <span style={{ color: checkResult.failed > 0 ? 'var(--red)' : 'var(--text2)' }}>{checkResult.failed} 断</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>暂无规则需要检测</div>
            )}
          </div>
        )}
      </div>
      {/* 规则概览 */}
      <div className="card">
        <div className="card-title">规则概览 ({rules.length})</div>
        {rules.length === 0 ? <div style={{ color: 'var(--text2)', fontSize: 14 }}>暂无中继规则</div> : (
          <table className="route-table">
            <thead><tr><th>名称</th><th>协议</th><th>本地端口</th><th>远程端口</th><th>域名</th></tr></thead>
            <tbody>{rules.map(r => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td><span className={`relay-badge ${r.proto}`}>{r.proto}</span></td>
                <td>{r.local_port}</td>
                <td>{r.remote_port || '-'}</td>
                <td>{r.domain || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

function RelayRules({ rules, refresh }: { rules: RelayRule[]; refresh: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [proto, setProto] = useState('tcp')
  const [localPort, setLocalPort] = useState('')
  const [remotePort, setRemotePort] = useState('')
  const [domain, setDomain] = useState('')
  const [output, setOutput] = useState('')

  const addRule = async () => {
    if (!name || !localPort) return
    const result = await RelayAddRule(name, proto, parseInt(localPort), parseInt(remotePort) || 0, domain)
    setOutput(result)
    await refresh()
    setName(''); setLocalPort(''); setRemotePort(''); setDomain('')
  }

  const removeRule = async (n: string) => {
    const result = await RelayRemoveRule(n)
    setOutput(result)
    await refresh()
  }

  return (
    <>
      <div className="page-title">规则管理</div>
      <div className="card">
        <div className="card-title">添加规则</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="input" style={{ width: 100 }} value={name} onChange={e => setName(e.target.value)} placeholder="名称" />
          <select className="select" style={{ width: 90 }} value={proto} onChange={e => setProto(e.target.value)}>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="http">HTTP</option>
          </select>
          <input className="input" style={{ width: 100 }} value={localPort} onChange={e => setLocalPort(e.target.value)} placeholder="本地端口" />
          <input className="input" style={{ width: 100 }} value={remotePort} onChange={e => setRemotePort(e.target.value)} placeholder="远程端口" />
          <input className="input" style={{ flex: 1, minWidth: 140 }} value={domain} onChange={e => setDomain(e.target.value)} placeholder="域名 (HTTP 模式可选)" />
          <button className="btn btn-primary" onClick={addRule}><IconPlus /> 添加</button>
        </div>
        {output && <div className="terminal">{output}</div>}
      </div>
      <div className="card">
        <div className="card-title">当前规则 ({rules.length})</div>
        {rules.length === 0 ? <div style={{ color: 'var(--text2)', fontSize: 14 }}>暂无中继规则</div> : (
          <table className="route-table">
            <thead><tr><th>名称</th><th>协议</th><th>本地端口</th><th>远程端口</th><th>域名</th><th>操作</th></tr></thead>
            <tbody>{rules.map(r => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td><span className={`relay-badge ${r.proto}`}>{r.proto}</span></td>
                <td>{r.local_port}</td>
                <td>{r.remote_port || '-'}</td>
                <td>{r.domain || '-'}</td>
                <td><button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => removeRule(r.name)}><IconTrash /> 删除</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

function RelayLogsPage() {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    const result = await GetRelayLogs()
    setLogs(result)
    setLoading(false)
  }

  useEffect(() => { fetchLogs() }, [])

  return (
    <>
      <div className="page-title">中继日志</div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>frpc 运行日志</div>
          <button className="btn btn-outline" onClick={fetchLogs} disabled={loading}>
            {loading ? <span className="spinner" /> : <IconRefresh />} 刷新
          </button>
        </div>
        <div className="terminal" style={{ maxHeight: 500 }}>{logs || '暂无日志'}</div>
      </div>
    </>
  )
}

function RelaySetupPage() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [user, setUser] = useState('root')
  const [authType, setAuthType] = useState<'key' | 'password'>('key')
  const [keyPath, setKeyPath] = useState('')
  const [password, setPassword] = useState('')
  const [frpsPort, setFrpsPort] = useState('7000')
  const [output, setOutput] = useState('')
  const [deploying, setDeploying] = useState(false)

  const selectKey = async () => {
    const dir = await SelectDirectory()
    if (dir) setKeyPath(dir)
  }

  const canDeploy = host && (authType === 'key' ? keyPath : password)

  const deploy = async () => {
    if (!canDeploy) return
    setDeploying(true)
    setOutput('正在连接服务器并部署 frps ...\n')
    const key = authType === 'key' ? keyPath : ''
    const pass = authType === 'password' ? password : ''
    const result = await RelayServerSetup(host, parseInt(port), user, key, pass, parseInt(frpsPort))
    setOutput(result)
    setDeploying(false)
  }

  return (
    <>
      <div className="page-title">服务端部署</div>
      <div className="card">
        <div className="card-title">远程安装 frps</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          通过 SSH 在远程 Linux 服务器上一键安装 frps 服务端
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div className="input-row">
            <input className="input" style={{ flex: 1 }} value={host} onChange={e => setHost(e.target.value)} placeholder="服务器 IP (如 1.2.3.4)" />
            <input className="input" style={{ width: 80 }} value={port} onChange={e => setPort(e.target.value)} placeholder="SSH 端口" />
          </div>
          <div className="input-row">
            <input className="input" style={{ width: 120 }} value={user} onChange={e => setUser(e.target.value)} placeholder="用户名" />
          </div>
          <div className="input-row">
            <span style={{ fontSize: 13, color: 'var(--text2)', minWidth: 60 }}>认证方式</span>
            <button className={`btn ${authType === 'key' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => setAuthType('key')}>SSH 密钥</button>
            <button className={`btn ${authType === 'password' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => setAuthType('password')}>密码</button>
          </div>
          {authType === 'key' ? (
            <div className="input-row">
              <input className="input" style={{ flex: 1 }} value={keyPath} onChange={e => setKeyPath(e.target.value)} placeholder="SSH 私钥路径 (如 ~/.ssh/id_rsa)" />
              <button className="btn btn-outline" onClick={selectKey}>选择</button>
            </div>
          ) : (
            <div className="input-row">
              <input className="input" type="password" style={{ flex: 1 }} value={password} onChange={e => setPassword(e.target.value)} placeholder="SSH 密码" />
            </div>
          )}
          <div className="input-row">
            <input className="input" style={{ width: 120 }} value={frpsPort} onChange={e => setFrpsPort(e.target.value)} placeholder="frps 端口" />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>frps 监听端口 (默认 7000)</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={deploy} disabled={deploying || !canDeploy}>
          {deploying ? <span className="spinner" /> : <IconSetup />} 开始部署
        </button>
      </div>
      {output && (
        <div className="card">
          <div className="card-title">部署输出</div>
          <div className="terminal" style={{ maxHeight: 400 }}>{output}</div>
        </div>
      )}
    </>
  )
}

function Terminal() {
  const [cmd, setCmd] = useState('')
  const [output, setOutput] = useState('欢迎使用 cftunnel 终端\n输入命令（不需要 cftunnel 前缀）\n')

  const run = async (c?: string) => {
    const command = c || cmd.trim()
    if (!command) return
    setOutput(prev => prev + `\n$ cftunnel ${command}\n`)
    const result = await RunCommand(command)
    setOutput(prev => prev + result + '\n')
    setCmd('')
  }

  const presets = [
    { label: '查看状态', cmd: 'status' },
    { label: '路由列表', cmd: 'list' },
    { label: '启动隧道', cmd: 'up' },
    { label: '停止隧道', cmd: 'down' },
    { label: '中继状态', cmd: 'relay status' },
    { label: '中继规则', cmd: 'relay list' },
    { label: '启动中继', cmd: 'relay up' },
    { label: '停止中继', cmd: 'relay down' },
    { label: '链路检测', cmd: 'relay check' },
    { label: '中继日志', cmd: 'relay logs' },
    { label: '查看版本', cmd: 'version' },
    { label: '查看日志', cmd: 'logs' },
  ]

  const commands = [
    { cmd: 'quick <端口>', desc: '免域名模式，生成临时公网地址' },
    { cmd: 'init', desc: '配置 API Token 和账户 ID' },
    { cmd: 'create <名称>', desc: '创建隧道' },
    { cmd: 'add <名称> <端口> --domain <域名>', desc: '添加路由' },
    { cmd: 'remove <名称>', desc: '删除路由' },
    { cmd: 'list', desc: '列出所有路由' },
    { cmd: 'up / down', desc: '启动 / 停止隧道' },
    { cmd: 'status', desc: '查看隧道状态' },
    { cmd: 'logs', desc: '查看隧道日志' },
    { cmd: 'relay init', desc: '配置中继服务器' },
    { cmd: 'relay add <名称> --proto <协议> --local <端口>', desc: '添加中继规则' },
    { cmd: 'relay remove <名称>', desc: '删除中继规则' },
    { cmd: 'relay list', desc: '列出中继规则' },
    { cmd: 'relay up / down', desc: '启动 / 停止中继' },
    { cmd: 'relay status', desc: '查看中继状态' },
    { cmd: 'relay check', desc: '检测链路连通性和延迟' },
    { cmd: 'relay logs', desc: '查看中继日志' },
    { cmd: 'relay install / uninstall', desc: '注册 / 卸载中继系统服务' },
    { cmd: 'relay server setup', desc: '远程部署 frps 服务端' },
    { cmd: 'install / uninstall', desc: '注册 / 卸载隧道系统服务' },
    { cmd: 'destroy', desc: '删除隧道 + 清理 DNS' },
    { cmd: 'update', desc: '自动更新 cftunnel' },
    { cmd: 'version', desc: '查看版本信息' },
  ]

  return (
    <>
      <div className="page-title">终端</div>
      <div className="card">
        <div className="card-title">快捷命令</div>
        <div className="btn-group" style={{ marginBottom: 16 }}>
          {presets.map(p => (
            <button key={p.cmd} className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => run(p.cmd)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>输出</span>
          <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setOutput('')}><IconClear /> 清屏</button>
        </div>
        <div className="terminal" style={{ maxHeight: 300, marginBottom: 12 }}>{output}</div>
        <div className="input-row">
          <span style={{ color: 'var(--green)', fontFamily: 'monospace', fontWeight: 700 }}>$</span>
          <input className="input" value={cmd} onChange={e => setCmd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()} placeholder="输入命令，如 status、list、up ..." />
          <button className="btn btn-primary" onClick={() => run()}><IconSend /> 执行</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">命令参考</div>
        <table className="route-table">
          <thead><tr><th>命令</th><th>说明</th></tr></thead>
          <tbody>{commands.map(c => (
            <tr key={c.cmd} style={{ cursor: 'pointer' }} onClick={() => setCmd(c.cmd.split(' /')[0])}>
              <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--accent2)' }}>{c.cmd}</td>
              <td>{c.desc}</td>
            </tr>
          ))}</tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)' }}>点击命令行可快速填入输入框</p>
      </div>
    </>
  )
}

function AboutPage({ version }: { version: string }) {
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{
    current_version: string; latest_version: string; has_update: boolean; release_url: string; err?: string
  } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => { GetAppVersion().then(setAppVersion) }, [])

  const handleCheckUpdate = async () => {
    setChecking(true)
    setUpdateInfo(null)
    try {
      const info = await CheckAppUpdate()
      setUpdateInfo(info)
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="page-title">关于我们</div>
      {/* 项目信息 */}
      <div className="card">
        <div className="card-title">cftunnel</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
          全协议内网穿透工具 — Cloud 模式免费穿透 HTTP/WS + Relay 模式自建中继 TCP/UDP 全协议
        </p>
        <table className="route-table">
          <tbody>
            <tr><td style={{ fontWeight: 600, width: 120 }}>CLI 版本</td><td>{version || '未安装'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>客户端版本</td><td>{appVersion || 'dev'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>开源协议</td><td>MIT License</td></tr>
            <tr><td style={{ fontWeight: 600 }}>开发公司</td><td>武汉晴辰天下网络科技有限公司</td></tr>
            <tr><td style={{ fontWeight: 600 }}>官网</td><td><a href="https://cftunnel.qt.cool" target="_blank" style={{ color: 'var(--accent2)' }}>cftunnel.qt.cool</a></td></tr>
            <tr><td style={{ fontWeight: 600 }}>公司官网</td><td><a href="https://qingchencloud.com" target="_blank" style={{ color: 'var(--accent2)' }}>qingchencloud.com</a></td></tr>
          </tbody>
        </table>
      </div>
      {/* 更新检测 */}
      <div className="card">
        <div className="card-title">更新检测</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={handleCheckUpdate} disabled={checking}>
            {checking ? <span className="spinner" /> : <IconRefresh />} {checking ? '检测中...' : '检查更新'}
          </button>
        </div>
        {updateInfo && (
          <div style={{ fontSize: 14 }}>
            {updateInfo.err ? (
              <span style={{ color: 'var(--red)' }}>{updateInfo.err}</span>
            ) : updateInfo.has_update ? (
              <div>
                <span style={{ color: 'var(--accent2)' }}>发现新版本: v{updateInfo.latest_version}</span>
                <span style={{ color: 'var(--text2)', marginLeft: 8 }}>(当前: v{updateInfo.current_version})</span>
                <div style={{ marginTop: 8 }}>
                  <a href={updateInfo.release_url} target="_blank" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    前往下载
                  </a>
                </div>
              </div>
            ) : (
              <span style={{ color: 'var(--green)' }}>已是最新版本 (v{updateInfo.current_version})</span>
            )}
          </div>
        )}
      </div>
      {/* 关联项目 */}
      <div className="card">
        <div className="card-title">关联项目</div>
        <table className="route-table">
          <thead><tr><th>项目</th><th>说明</th></tr></thead>
          <tbody>
            <tr>
              <td><a href="https://github.com/qingchencloud/cftunnel" target="_blank" style={{ color: 'var(--accent2)' }}>cftunnel</a></td>
              <td>CLI 命令行工具（本项目核心）</td>
            </tr>
            <tr>
              <td><a href="https://github.com/qingchencloud/cftunnel-app" target="_blank" style={{ color: 'var(--accent2)' }}>cftunnel-app</a></td>
              <td>桌面客户端（Wails + React）</td>
            </tr>
            <tr>
              <td><a href="https://github.com/qingchencloud/clawapp" target="_blank" style={{ color: 'var(--accent2)' }}>ClawApp</a></td>
              <td>跨平台桌面应用</td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* 联系方式 */}
      <div className="card">
        <div className="card-title">联系我们</div>
        <table className="route-table">
          <tbody>
            <tr><td style={{ fontWeight: 600, width: 120 }}>GitHub</td><td><a href="https://github.com/qingchencloud/cftunnel" target="_blank" style={{ color: 'var(--accent2)' }}>qingchencloud/cftunnel</a></td></tr>
            <tr><td style={{ fontWeight: 600 }}>Issues</td><td><a href="https://github.com/qingchencloud/cftunnel/issues" target="_blank" style={{ color: 'var(--accent2)' }}>反馈问题</a></td></tr>
            <tr><td style={{ fontWeight: 600 }}>QQ 群</td><td><a href="https://qm.qq.com/q/qUfdR0jJVS" target="_blank" style={{ color: 'var(--accent2)' }}>OpenClaw 交流群</a></td></tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

type DiagnoseData = {
  cloudflared: { installed: boolean; path: string; version: string; running: boolean; pid: number }
  api: { reachable: boolean; latency_ms: number; err: string }
  routes: { name: string; hostname: string; service: string; local_ok: boolean; local_err: string; dns_ok: boolean; dns_err: string; http_ok: boolean; http_err: string }[]
  total: number; passed: number; failed: number
}

function DiagnosePage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DiagnoseData | null>(null)

  const run = async () => {
    setLoading(true)
    const result = await Diagnose()
    setData(result)
    setLoading(false)
  }

  const Check = ({ ok, err }: { ok: boolean; err?: string }) => (
    <span style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>
      {ok ? '✓ 正常' : `✗ ${err || '异常'}`}
    </span>
  )

  return (
    <>
      <div className="page-title">链路诊断</div>
      <div className="card">
        <div className="card-title">Cloud 模式诊断</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
          检测 cloudflared、Cloudflare API、本地服务、DNS 解析和域名可达性
        </p>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? <span className="spinner" /> : <IconDiagnose size={16} />} {loading ? '检测中...' : '开始检测'}
        </button>
      </div>
      {data && (
        <>
          <div className="card">
            <div className="card-title">基础检测</div>
            <table className="route-table">
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, width: 160 }}>cloudflared</td>
                  <td><Check ok={data.cloudflared.installed} err="未安装" /></td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{data.cloudflared.version}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>cloudflared 进程</td>
                  <td><Check ok={data.cloudflared.running} err="未运行" /></td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{data.cloudflared.running ? `PID: ${data.cloudflared.pid}` : ''}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>Cloudflare API</td>
                  <td><Check ok={data.api.reachable} err={data.api.err || '不可达'} /></td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{data.api.reachable ? `${data.api.latency_ms}ms` : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {data.routes && data.routes.length > 0 && (
            <div className="card">
              <div className="card-title">路由检测 ({data.passed}/{data.total} 通过)</div>
              <table className="route-table">
                <thead><tr><th>路由</th><th>域名</th><th>本地服务</th><th>DNS</th><th>HTTPS</th></tr></thead>
                <tbody>
                  {data.routes.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{r.hostname}</td>
                      <td><Check ok={r.local_ok} err={r.local_err} /></td>
                      <td><Check ok={r.dns_ok} err={r.dns_err} /></td>
                      <td>{r.dns_ok ? <Check ok={r.http_ok} err={r.http_err} /> : <span style={{ color: 'var(--text2)' }}>-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

export default App
