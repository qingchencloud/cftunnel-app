import { useState, useEffect, useCallback } from 'react'
import './style.css'
import { CheckInstall, GetStatus, GetRoutes, TunnelUp, TunnelDown, RunCommand, GetRelayStatus, GetRelayRules, RelayUp, RelayDown, RelayAddRule, RelayRemoveRule, RelayInit, RelayInstallService, RelayUninstallService, GetRelayLogs, RelayServerSetup, SelectDirectory, RelayCheck, GetAppVersion, CheckAllUpdates, UpdateCLI, StartQuick, QuickStop, QuickRunning, QuickURL, Diagnose, DetectLocalServices, GetCloudCredentialsStatus, SaveCloudCredentials } from '../wailsjs/go/main/App'
import { IconDashboard, IconZap, IconRoute, IconTerminal, IconAlert, IconPlay, IconStop, IconRefresh, IconPlus, IconTrash, IconSend, IconClear, IconRelay, IconServer, IconLog, IconSetup, IconInfo, IconDiagnose } from './Icons'
import { BrowserOpenURL } from '../wailsjs/runtime/runtime'

type Route = { name: string; hostname: string; service: string }
type RelayRule = { name: string; proto: string; local_port: number; remote_port: number; domain: string }
type RelayStatus = { server: string; running: boolean; pid: string; rules: number }
type UpdateInfo = { product: string; current_version: string; latest_version: string; has_update: boolean; release_url: string; err?: string }
type Page = 'home' | 'dashboard' | 'routes' | 'diagnose' | 'terminal' | 'relay-dashboard' | 'relay-rules' | 'relay-logs' | 'relay-setup' | 'settings' | 'about'

const TELEGRAM_GROUP_URL = 'https://t.me/+-53et5QXFh0xYzhk'

function App() {
  const [page, setPage] = useState<Page>('home')
  const [version, setVersion] = useState('')
  const [installed, setInstalled] = useState(false)
  const [status, setStatus] = useState('')
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  // Relay 状态
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({ server: '', running: false, pid: '', rules: 0 })
  const [relayRules, setRelayRules] = useState<RelayRule[]>([])
  const [updates, setUpdates] = useState<UpdateInfo[]>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)

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

  const checkUpdates = useCallback(async () => {
    setCheckingUpdates(true)
    try {
      const result = await CheckAllUpdates()
      setUpdates((result || []) as UpdateInfo[])
    } catch {
      // 浏览器预览没有 Wails bridge；桌面端会在启动时静默检查。
    } finally {
      setCheckingUpdates(false)
    }
  }, [])

  useEffect(() => {
    let enabled = true
    try { enabled = localStorage.getItem('cftunnel.autoUpdateCheck') !== 'false' } catch { /* 使用默认值 */ }
    if (enabled) {
      const timer = window.setTimeout(() => { void checkUpdates() }, 900)
      return () => window.clearTimeout(timer)
    }
  }, [checkUpdates])

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
    if (!installed && page !== 'home' && page !== 'about' && page !== 'settings') return <NotInstalled />
    switch (page) {
      case 'home': return <Home />
      case 'dashboard': return <Dashboard status={status} isRunning={isRunning} routes={routes} loading={loading} setLoading={setLoading} refresh={refresh} />
      case 'routes': return <Routes routes={routes} refresh={refresh} />
      case 'diagnose': return <DiagnosePage />
      case 'relay-dashboard': return <RelayDashboard status={relayStatus} rules={relayRules} loading={loading} setLoading={setLoading} refresh={refresh} />
      case 'relay-rules': return <RelayRules rules={relayRules} refresh={refresh} />
      case 'relay-logs': return <RelayLogsPage />
      case 'relay-setup': return <RelaySetupPage />
      case 'terminal': return <Terminal />
      case 'settings': return <SettingsPage />
      case 'about': return <AboutPage version={version} updates={updates} checking={checkingUpdates} onCheck={checkUpdates} />
    }
  }

  return (
    <>
      <div className="titlebar">cftunnel</div>
      <div className="app">
        <Sidebar page={page} setPage={setPage} version={version} />
        <div className="main">
          {updates.some(u => u.has_update) && <UpdateBanner updates={updates} onOpen={() => setPage('about')} />}
          {renderPage()}
        </div>
      </div>
    </>
  )
}

function Sidebar({ page, setPage, version }: { page: Page; setPage: (p: Page) => void; version: string }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const NavBtn = ({ id, icon, label }: { id: Page; icon: JSX.Element; label: string }) => (
    <button className={`nav-item${page === id ? ' active' : ''}`} onClick={() => setPage(id)}>
      {icon} {label}
    </button>
  )
  return (
    <div className="sidebar">
      <div className="sidebar-header"><span className="brand-mark">cf</span><span>tunnel</span></div>
      <div className="sidebar-nav">
        <NavBtn id="home" icon={<IconZap />} label="一键分享" />
        <button className={`nav-item nav-toggle${showAdvanced ? ' expanded' : ''}`} onClick={() => setShowAdvanced(v => !v)}>
          <IconServer /> 高级功能 <span className="nav-chevron">{showAdvanced ? '−' : '+'}</span>
        </button>
        {showAdvanced && <div className="nav-advanced">
          <NavBtn id="dashboard" icon={<IconDashboard />} label="仪表盘" />
          <NavBtn id="routes" icon={<IconRoute />} label="路由管理" />
          <NavBtn id="diagnose" icon={<IconDiagnose />} label="链路诊断" />
          <NavBtn id="relay-dashboard" icon={<IconRelay />} label="中继面板" />
          <NavBtn id="relay-rules" icon={<IconServer />} label="规则管理" />
          <NavBtn id="relay-logs" icon={<IconLog />} label="中继日志" />
          <NavBtn id="relay-setup" icon={<IconSetup />} label="服务端部署" />
          <NavBtn id="terminal" icon={<IconTerminal />} label="终端" />
          <NavBtn id="settings" icon={<IconSetup />} label="设置" />
          <NavBtn id="about" icon={<IconInfo />} label="关于我们" />
        </div>}
      </div>
      <div className="sidebar-footer">{version ? `v${version.replace(/^v/, '')}` : '就绪'}</div>
    </div>
  )
}

function UpdateBanner({ updates, onOpen }: { updates: UpdateInfo[]; onOpen: () => void }) {
  const pending = updates.filter(u => u.has_update)
  return <div className="update-banner">
    <div><strong>发现可用更新</strong><span>{pending.map(u => `${u.product} v${u.latest_version}`).join('、')}</span></div>
    <button className="btn btn-primary" onClick={onOpen}>打开更新中心</button>
  </div>
}

function NotInstalled() {
  return (
    <div className="empty">
      <div className="empty-icon"><IconAlert /></div>
      <p>高级管理需要 cftunnel CLI</p>
      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
        左侧“一键分享”不需要额外配置；需要固定域名、路由或中继时，再安装 CLI 即可。
      </p>
      <a href="https://github.com/qingchencloud/cftunnel#install" target="_blank" className="btn btn-outline" style={{ marginTop: 16, textDecoration: 'none' }}>查看安装方式</a>
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

function Home() {
  const [port, setPort] = useState('')
  const [services, setServices] = useState<{ port: number; name: string; url: string; latency_ms: number }[]>([])
  const [showManual, setShowManual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const detect = useCallback(async () => {
    try {
      const found = await DetectLocalServices()
      setServices(found || [])
      if (!found?.length) setShowManual(true)
      setPort(current => current || (found?.[0] ? String(found[0].port) : '3000'))
    } catch {
      setServices([])
      setShowManual(true)
      setPort(current => current || '3000')
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const active = await QuickRunning()
      setRunning(active)
      if (active) {
        const currentURL = await QuickURL()
        if (currentURL) setUrl(currentURL)
      } else {
        setUrl('')
      }
    } catch {
      setRunning(false)
      setUrl('')
    }
  }, [])

  useEffect(() => {
    detect()
    checkStatus()
  }, [detect, checkStatus])

  const start = async (selectedPort = port) => {
    if (!selectedPort) return
    setLoading(true)
    setError('')
    setUrl('')
    setCopied(false)
    try {
      const result = await StartQuick(selectedPort)
      if (result.err) {
        setError(result.err)
        return
      }
      if (result.url) setUrl(result.url)
      await checkStatus()
      if (!result.url) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 1000))
          const currentURL = await QuickURL()
          if (currentURL) { setUrl(currentURL); break }
          if (!await QuickRunning()) { setError('穿透组件启动后退出，请检查本地服务是否仍在运行'); break }
        }
      }
    } catch (err) {
      setError(`启动失败: ${err instanceof Error ? err.message : '请重试'}`)
    } finally {
      setLoading(false)
      await checkStatus()
    }
  }

  const stop = async () => {
    setLoading(true)
    setError('')
    try {
      await QuickStop()
      await checkStatus()
    } catch (err) {
      setError(`停止失败: ${err instanceof Error ? err.message : '请重试'}`)
    } finally {
      setLoading(false)
    }
  }

  const copyURL = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('复制失败，请手动选择地址复制')
    }
  }

  return (
    <div className="home-page">
      <div className="home-header">
        <div>
          <div className="eyebrow">cftunnel / QUICK SHARE</div>
          <h1>把本地服务分享出去</h1>
          <p>不用域名，不用 Token。选一个正在运行的服务，点一次就得到公网地址。</p>
        </div>
        <button className="btn btn-outline detect-btn" onClick={detect} disabled={loading}>
          <IconRefresh /> 重新检测
        </button>
      </div>

      <div className="share-card">
        <div className="share-card-top">
          <div>
            <div className="card-title">选择本地服务</div>
            <div className="muted">我们会自动寻找常见开发端口，不改动你的项目配置。</div>
          </div>
          <span className={`ready-badge${running ? ' live' : ''}`}><span className="ready-dot" />{running ? '分享中' : services.length ? '已发现服务' : '等待服务'}</span>
        </div>
        {services.length > 0 ? (
          <div className="service-list">
            {services.map(service => (
              <button key={service.port} className={`service-option${port === String(service.port) ? ' selected' : ''}`} onClick={() => setPort(String(service.port))} disabled={running}>
                <span className="service-icon"><IconZap size={16} /></span>
                <span className="service-copy"><strong>{service.name}</strong><small>{service.url}</small></span>
                <span className="service-check">{port === String(service.port) ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-services"><span className="empty-services-icon"><IconRoute /></span><span>暂时没发现本地服务</span><small>启动你的项目后点“重新检测”，或直接输入端口。</small></div>
        )}
        <div className="share-controls">
          {showManual ? <div className="manual-port">
            <label htmlFor="quick-port">本地端口</label>
            <input id="quick-port" className="input" value={port} onChange={e => setPort(e.target.value)} placeholder="例如 3000" disabled={running} />
          </div> : <button className="text-button" onClick={() => setShowManual(true)}>其他端口</button>}
          <button className="btn btn-primary share-action" onClick={() => running ? stop() : start()} disabled={loading || !port}>
            {loading ? <span className="spinner" /> : running ? <IconStop /> : <IconZap size={17} />}
            {loading ? '处理中...' : running ? '停止分享' : '一键生成地址'}
          </button>
        </div>
        {error && <div className="inline-error">{error}</div>}
      </div>

      {running && url && (
        <div className="url-card">
          <div className="url-card-heading"><span className="live-pulse" />公网地址已生成</div>
          <div className="url-row"><code>{url}</code><button className="btn btn-outline" onClick={copyURL}>{copied ? '已复制' : '复制'}</button><button className="btn btn-primary" onClick={() => BrowserOpenURL(url)}>打开</button></div>
          <div className="muted">把这个地址发给需要访问你本地服务的人即可。</div>
        </div>
      )}

      <div className="home-footnote"><span>安全提示</span> 临时地址只在分享期间有效。需要固定域名或中继 TCP/UDP？请展开左侧“高级功能”。
        <a className="community-link" href={TELEGRAM_GROUP_URL} target="_blank">加入 Telegram 群</a>
      </div>
    </div>
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

function SettingsPage() {
  const [autoUpdateCheck, setAutoUpdateCheck] = useState(() => {
    try { return localStorage.getItem('cftunnel.autoUpdateCheck') !== 'false' } catch { return true }
  })
  const [fixedEnabled, setFixedEnabled] = useState(() => {
    try { return localStorage.getItem('cftunnel.fixedEnabled') === 'true' } catch { return false }
  })
  const [configured, setConfigured] = useState(false)
  const [accountID, setAccountID] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [output, setOutput] = useState('')

  useEffect(() => {
    GetCloudCredentialsStatus().then(status => setConfigured(status.configured)).catch(() => setConfigured(false))
  }, [])

  const toggleFixed = (enabled: boolean) => {
    setFixedEnabled(enabled)
    try { localStorage.setItem('cftunnel.fixedEnabled', String(enabled)) } catch { /* 忽略不可用的本地存储 */ }
  }

  const toggleAutoUpdate = (enabled: boolean) => {
    setAutoUpdateCheck(enabled)
    try { localStorage.setItem('cftunnel.autoUpdateCheck', String(enabled)) } catch { /* 忽略不可用的本地存储 */ }
  }

  const saveCredentials = async () => {
    if (!accountID.trim() || !apiToken.trim()) {
      setOutput('请填写账户 ID 和 API Token')
      return
    }
    setSaving(true)
    setOutput('')
    try {
      const result = await SaveCloudCredentials(accountID, apiToken)
      setOutput(result)
      if (!result.startsWith('错误:')) {
        setConfigured(true)
        setApiToken('')
      }
    } catch (err) {
      setOutput(`保存失败: ${err instanceof Error ? err.message : '请重试'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-title">设置</div>
      <div className="card settings-card">
        <div className="card-title">使用模式</div>
        <div className="setting-row">
          <div><strong>一键分享</strong><div className="muted">无需账号、域名或任何配置，适合临时分享。</div></div>
          <span className="setting-status enabled">始终可用</span>
        </div>
        <div className="setting-row">
          <div><strong>固定域名模式</strong><div className="muted">启用后可管理自有域名和长期隧道。</div></div>
          <label className="switch"><input type="checkbox" checked={fixedEnabled} onChange={e => toggleFixed(e.target.checked)} /><span /></label>
        </div>
        <div className="setting-row">
          <div><strong>启动时检查更新</strong><div className="muted">自动检查桌面客户端和 cftunnel 终端主体，发现新版本后在更新中心提示。</div></div>
          <label className="switch"><input type="checkbox" checked={autoUpdateCheck} onChange={e => toggleAutoUpdate(e.target.checked)} /><span /></label>
        </div>
        <div className="setting-row">
          <div><strong>中继模式</strong><div className="muted">TCP / UDP 和自建服务器配置在“中继面板”中管理。</div></div>
          <span className="setting-status">高级功能</span>
        </div>
      </div>

      {fixedEnabled && <div className="card settings-card">
        <div className="card-title">固定域名账号</div>
        <p className="muted settings-help">Cloudflare 使用 API Token，不保存网页登录密码；Token 由本机 CLI 写入受限配置文件。</p>
        <div className="settings-form">
          <label>账户 ID<input className="input" value={accountID} onChange={e => setAccountID(e.target.value)} placeholder="Cloudflare Account ID" /></label>
          <label>API Token<input className="input" type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder={configured ? '已配置，如需更换请重新输入' : 'Cloudflare API Token'} /></label>
        </div>
        <div className="settings-actions"><button className="btn btn-primary" onClick={saveCredentials} disabled={saving}>{saving ? <span className="spinner" /> : <IconSetup />} 保存账号配置</button>{configured && <span className="setting-status enabled">已配置</span>}</div>
        {output && <div className={`settings-output${output.startsWith('错误:') ? ' error' : ''}`}>{output}</div>}
      </div>}
    </>
  )
}

function AboutPage({ version, updates, checking, onCheck }: { version: string; updates: UpdateInfo[]; checking: boolean; onCheck: () => Promise<void> }) {
  const [appVersion, setAppVersion] = useState('')
  const [updatingCLI, setUpdatingCLI] = useState(false)
  const [cliOutput, setCLIOutput] = useState('')

  useEffect(() => { GetAppVersion().then(setAppVersion) }, [])

  const updateCLI = async () => {
    setUpdatingCLI(true)
    setCLIOutput('')
    try {
      setCLIOutput(await UpdateCLI())
      await onCheck()
    } catch (err) {
      setCLIOutput(String(err))
    } finally {
      setUpdatingCLI(false)
    }
  }

  return (
    <>
      <div className="page-title">关于我们</div>
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
      <div className="card">
        <div className="card-title">更新中心</div>
        <p className="muted update-help">启动时会自动检查客户端和终端主体程序。更新前会保留当前配置。</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => void onCheck()} disabled={checking}>
            {checking ? <span className="spinner" /> : <IconRefresh />} {checking ? '检测中...' : '检查全部更新'}
          </button>
        </div>
        <div className="update-list">
          {updates.length === 0 && <div className="muted">点击上面的按钮获取最新版本信息。</div>}
          {updates.map(info => <div className="update-row" key={info.product}>
            <div><strong>{info.product}程序</strong><div className="muted">当前 v{info.current_version || 'dev'} · 最新 v{info.latest_version || '未知'}</div></div>
            {info.err ? <span className="update-error">{info.err}</span> : info.current_version === '未安装' ? <span className="muted">未安装 CLI</span> : info.has_update ? (
              <div className="btn-group">
                {info.product === '终端' ? <button className="btn btn-primary" onClick={() => void updateCLI()} disabled={updatingCLI}>{updatingCLI ? <span className="spinner" /> : <IconSetup />} 一键更新</button> : <a href={info.release_url} target="_blank" className="btn btn-primary" style={{ textDecoration: 'none' }}>下载新版</a>}
              </div>
            ) : <span className="update-ok">已是最新</span>}
          </div>)}
        </div>
        {cliOutput && <div className="settings-output" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{cliOutput}</div>}
      </div>
      <div className="card">
        <div className="card-title">关联项目</div>
        <table className="route-table">
          <thead><tr><th>项目</th><th>说明</th></tr></thead>
          <tbody>
            <tr><td><a href="https://github.com/qingchencloud/cftunnel" target="_blank" style={{ color: 'var(--accent2)' }}>cftunnel</a></td><td>CLI 命令行工具（本项目核心）</td></tr>
            <tr><td><a href="https://github.com/qingchencloud/cftunnel-app" target="_blank" style={{ color: 'var(--accent2)' }}>cftunnel-app</a></td><td>桌面客户端（Wails + React）</td></tr>
            <tr><td><a href="https://github.com/qingchencloud/clawapp" target="_blank" style={{ color: 'var(--accent2)' }}>ClawApp</a></td><td>跨平台桌面应用</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-title">联系我们</div>
        <table className="route-table">
          <tbody>
            <tr><td style={{ fontWeight: 600, width: 120 }}>GitHub</td><td><a href="https://github.com/qingchencloud/cftunnel" target="_blank" style={{ color: 'var(--accent2)' }}>qingchencloud/cftunnel</a></td></tr>
            <tr><td style={{ fontWeight: 600 }}>Issues</td><td><a href="https://github.com/qingchencloud/cftunnel/issues" target="_blank" style={{ color: 'var(--accent2)' }}>反馈问题</a></td></tr>
            <tr><td style={{ fontWeight: 600 }}>QQ 群</td><td><a href="https://qm.qq.com/q/qUfdR0jJVS" target="_blank" style={{ color: 'var(--accent2)' }}>OpenClaw 交流群</a></td></tr>
            <tr><td style={{ fontWeight: 600 }}>Telegram 群</td><td><a href={TELEGRAM_GROUP_URL} target="_blank" style={{ color: 'var(--accent2)' }}>加入 cftunnel Telegram 群</a></td></tr>
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
