<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>💰 Finanças Avançadas</title>

<!-- PWA Meta Tags -->
<meta name="theme-color" content="#6366f1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Finanças">
<meta name="mobile-web-app-capable" content="yes">
<meta name="description" content="Sistema completo de gestão financeira pessoal">

<!-- Manifest -->
<link rel="manifest" id="manifestPlaceholder">

<!-- App Icons -->
<link rel="icon" type="image/png" sizes="192x192" id="icon192">
<link rel="icon" type="image/png" sizes="512x512" id="icon512">
<link rel="apple-touch-icon" id="appleTouchIcon">

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>

<style>
:root{--primary:#6366f1;--primary-dark:#4f46e5;--success:#10b981;--warning:#f59e0b;--danger:#ef4444;--secondary:#ec4899;--light:#f8fafc;--border:#e2e8f0;--text-primary:#0f172a;--text-secondary:#64748b;--shadow:0 2px 4px rgba(0,0,0,.1);--shadow-lg:0 8px 16px rgba(0,0,0,.15);--radius:12px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{font-family:Inter,-apple-system,sans-serif;background:linear-gradient(135deg,#667eea 0,#764ba2 100%);min-height:100vh;color:var(--text-primary);overflow-x:hidden}
.login-container{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.login-card{background:rgba(255,255,255,.98);backdrop-filter:blur(20px);border-radius:20px;box-shadow:var(--shadow-lg);padding:32px 24px;max-width:400px;width:100%;animation:fadeIn .4s}
@keyframes fadeIn{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
.login-header{text-align:center;margin-bottom:24px}.login-header h1{font-size:26px;font-weight:800;color:var(--primary);margin-bottom:6px}.login-header p{color:var(--text-secondary);font-size:14px}
.login-tabs{display:flex;gap:6px;margin-bottom:20px;background:var(--light);padding:4px;border-radius:10px}
.login-tab{flex:1;padding:10px;background:0 0;border:none;border-radius:8px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all .2s}
.login-tab.active{background:#fff;color:var(--primary);box-shadow:var(--shadow)}
.login-form{display:flex;flex-direction:column;gap:16px}
.form-group{display:flex;flex-direction:column;gap:6px}.form-label{font-size:12px;font-weight:600;color:var(--text-primary)}
.form-input,.form-select,.form-textarea{width:100%;padding:12px 14px;background:#fff;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;transition:all .2s;outline:0}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.form-textarea{resize:vertical;min-height:70px}
.checkbox-wrapper{display:flex;align-items:center;gap:10px;padding:8px 0}
.checkbox-input{width:18px;height:18px;cursor:pointer;accent-color:var(--primary)}.checkbox-label{font-size:13px;font-weight:500;cursor:pointer}
.btn{padding:12px 24px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:var(--shadow);width:100%;touch-action:manipulation}
.btn:active{transform:scale(.98)}.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn-success{background:linear-gradient(135deg,var(--success),#059669)}.btn-danger{background:linear-gradient(135deg,var(--danger),#dc2626)}.btn-warning{background:linear-gradient(135deg,var(--warning),#d97706)}.btn-secondary{background:linear-gradient(135deg,var(--secondary),#db2777)}
.btn-sm{padding:8px 14px;font-size:12px;width:auto;margin:0}.btn-outline{background:#fff;color:var(--primary);border:2px solid var(--primary)}.btn-outline:active{background:var(--light)}
.app-container{display:none;min-height:100vh;background:var(--light)}.app-container.logged-in{display:block}
.header{background:linear-gradient(135deg,var(--primary),var(--primary-dark));padding:20px 16px;color:#fff;position:sticky;top:0;z-index:100;box-shadow:var(--shadow-lg)}
.header-content{margin-bottom:8px}.header-content h1{font-size:20px;font-weight:800;margin-bottom:4px}.header-content p{opacity:.9;font-size:12px}
.header-user{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2)}.header-user-email{font-size:11px;opacity:.8}
.btn-logout{padding:6px 12px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer}
.balance-hero{background:linear-gradient(135deg,#10b981,#059669);margin:16px;padding:20px 16px;border-radius:var(--radius);box-shadow:var(--shadow-lg);color:#fff}.balance-hero.negative{background:linear-gradient(135deg,#ef4444,#dc2626)}
.balance-label{font-size:11px;font-weight:600;text-transform:uppercase;opacity:.8;margin-bottom:6px}.balance-amount{font-size:32px;font-weight:800;line-height:1;margin-bottom:16px}
.balance-details{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.balance-item{display:flex;align-items:center;gap:8px}
.balance-icon{width:28px;height:28px;background:rgba(255,255,255,.2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px}
.balance-item-label{font-size:10px;opacity:.7}.balance-item-value{font-size:13px;font-weight:700}
.nav-tabs{display:flex;background:#fff;padding:8px;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:sticky;top:60px;z-index:99;box-shadow:0 2px 4px rgba(0,0,0,.05)}
.nav-tabs::-webkit-scrollbar{display:none}.nav-tab{flex-shrink:0;min-width:90px;padding:10px 12px;background:0 0;border:none;border-radius:8px;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all .2s;white-space:nowrap}
.nav-tab.active{background:var(--primary);color:#fff}
.content-area{padding:16px;padding-bottom:80px}
.section{display:none;animation:fadeIn .3s}.section.active{display:block}
.form-section{background:#fff;padding:16px;border-radius:var(--radius);margin-bottom:16px;box-shadow:var(--shadow)}
.form-header{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--light)}.form-header h2{font-size:16px;font-weight:700}
.form-header-icon{width:32px;height:32px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
.form-grid{display:flex;flex-direction:column;gap:14px}.form-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.section-title{font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px}
.card-list{display:flex;flex-direction:column;gap:10px}
.card-item{background:#fff;padding:14px;border-radius:var(--radius);border:2px solid var(--border);transition:all .2s;box-shadow:var(--shadow)}.card-item:active{transform:scale(.99)}
.card-header{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.card-main{flex:1;min-width:0}
.card-title{font-size:14px;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.card-subtitle{font-size:11px;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.card-amount{font-size:18px;font-weight:700;color:var(--primary);flex-shrink:0}.card-amount.positive{color:var(--success)}.card-amount.negative{color:var(--danger)}
.card-actions{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--light);flex-wrap:wrap}
.event-card {
    background: #fff;
    border: 2px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    transition: all 0.2s;
}

.event-card.today {
    border-color: var(--danger);
    background: #fee2e2;
}

.event-card.tomorrow {
    border-color: var(--warning);
    background: #fef3c7;
}

.event-card.soon {
    border-color: var(--primary);
    background: #eff6ff;
}

.event-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 8px;
}

.event-info {
    flex: 1;
    min-width: 0;
}

.event-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.event-date {
    font-size: 11px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
}

.event-value {
    font-size: 16px;
    font-weight: 700;
    flex-shrink: 0;
}

.event-value.negative {
    color: var(--danger);
}

.event-value.positive {
    color: var(--success);
}

.event-actions {
    display: flex;
    gap: 4px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
}

.event-actions button {
    flex: 1;
    padding: 6px 8px;
    font-size: 11px;
    border-radius: 6px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-postpone {
    background: var(--warning);
    color: #fff;
}

.btn-mark-paid {
    background: var(--success);
    color: #fff;
}

.btn-delete-event {
    background: var(--danger);
    color: #fff;
}
.badge{display:inline-flex;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;text-transform:uppercase}
.badge-mercado{background:#dbeafe;color:#1e40af}.badge-farmacia{background:#fce7f3;color:#9f1239}.badge-alimentacao{background:#dcfce7;color:#166534}.badge-transporte{background:#fef3c7;color:#92400e}.badge-luz{background:#fef3c7;color:#92400e}.badge-agua{background:#dbeafe;color:#1e40af}.badge-internet{background:#e0e7ff;color:#3730a3}.badge-celular{background:#fce7f3;color:#9f1239}.badge-outros{background:#f1f5f9;color:#475569}
.badge-pago{background:#dcfce7;color:#166534}.badge-pendente{background:#fef3c7;color:#92400e}.badge-ativa{background:#dcfce7;color:#166534}.badge-inativa{background:#f1f5f9;color:#475569}
.badge-plan{background:#e0e7ff;color:#3730a3}.badge-incluido{background:#dcfce7;color:#166534}.badge-excluido{background:#fee2e2;color:#991b1b}.badge-editado{background:#fef3c7;color:#92400e}.badge-novo{background:#ddd6fe;color:#5b21b6}
.progress-container{margin:12px 0}.progress-header{display:flex;justify-content:space-between;margin-bottom:6px}.progress-label{font-size:11px;font-weight:600;color:var(--text-secondary)}.progress-value{font-size:11px;font-weight:700;color:var(--primary)}
.progress-bar{height:10px;background:var(--light);border-radius:5px;overflow:hidden}.progress-fill{height:100%;background:linear-gradient(90deg,var(--primary),#818cf8);transition:width .5s ease}
.empty-state{text-align:center;padding:40px 16px}.empty-icon{font-size:48px;margin-bottom:12px;opacity:.3}.empty-title{font-size:15px;font-weight:600;margin-bottom:6px}.empty-text{font-size:12px;color:var(--text-secondary)}
.alert{padding:12px 14px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:12px}
.alert-success{background:#dcfce7;color:#166534;border:2px solid #86efac}.alert-info{background:#dbeafe;color:#1e40af;border:2px solid #93c5fd}.alert-warning{background:#fef3c7;color:#92400e;border:2px solid #fde68a}.alert-error{background:#fee2e2;color:#991b1b;border:2px solid #fca5a5}
.toast-container{position:fixed;top:16px;right:16px;left:16px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none}
.toast{background:#fff;padding:12px 14px;border-radius:10px;box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:10px;animation:slideIn .3s;border-left:4px solid var(--primary);pointer-events:auto}
@keyframes slideIn{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
.toast-success{border-left-color:var(--success)}.toast-error{border-left-color:var(--danger)}.toast-warning{border-left-color:var(--warning)}
.toast-icon{font-size:20px;flex-shrink:0}.toast-content{flex:1;min-width:0}.toast-title{font-size:12px;font-weight:600;margin-bottom:2px}.toast-message{font-size:11px;color:var(--text-secondary)}
.loading{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:flex-end;justify-content:center;animation:fadeIn .3s;padding:0}.modal-overlay.active{display:flex}
.modal-content{background:#fff;border-radius:20px 20px 0 0;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;animation:slideUp .3s}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.modal-header{padding:16px;border-bottom:2px solid var(--light);position:sticky;top:0;background:#fff;z-index:1;display:flex;align-items:center;justify-content:space-between}.modal-title{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
.modal-body{padding:16px}.modal-footer{padding:16px;border-top:2px solid var(--light);display:flex;gap:8px;position:sticky;bottom:0;background:#fff}
.btn-close{background:var(--light);border:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;flex-shrink:0}
.plan-card{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:16px;border-radius:var(--radius);margin-bottom:12px;box-shadow:var(--shadow-lg)}.plan-card.inactive{opacity:.6;background:linear-gradient(135deg,#64748b,#475569)}
.plan-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:12px}.plan-name{font-size:16px;font-weight:700}.plan-status{font-size:10px;background:rgba(255,255,255,.2);padding:4px 8px;border-radius:5px}
.plan-info{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:12px;margin-bottom:12px}.plan-info-item{background:rgba(255,255,255,.1);padding:8px;border-radius:6px}.plan-info-label{opacity:.8;font-size:10px;margin-bottom:2px}.plan-info-value{font-weight:700}
.timeline-container{background:#fff;border-radius:var(--radius);padding:16px;margin-bottom:16px;box-shadow:var(--shadow)}.timeline-header{font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px}
.timeline-months{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px}
.timeline-month{flex-shrink:0;background:var(--light);padding:12px;border-radius:8px;min-width:140px;border:2px solid var(--border);cursor:pointer;transition:all .2s}.timeline-month:hover{border-color:var(--primary);transform:translateY(-2px)}
.timeline-month.negative{border-color:var(--danger);background:#fee2e2}.timeline-month.positive{border-color:var(--success);background:#dcfce7}.timeline-month.selected{border-color:var(--primary);background:#eff6ff;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.timeline-month-name{font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px}.timeline-month-saldo{font-size:18px;font-weight:700;color:var(--primary);margin-bottom:4px}.timeline-month-details{font-size:10px;color:var(--text-secondary)}
.month-details-panel{background:#fff;border-radius:var(--radius);padding:16px;margin-top:12px;box-shadow:var(--shadow)}.month-details-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-top:2px solid var(--light)}.month-details-title{font-size:16px;font-weight:700;color:var(--primary)}
.item-type-tabs{display:flex;gap:4px;margin-bottom:12px;overflow-x:auto;-webkit-overflow-scrolling:touch}.item-type-tab{flex-shrink:0;padding:8px 12px;background:var(--light);border:none;border-radius:8px;font-size:11px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all .2s}.item-type-tab.active{background:var(--primary);color:#fff}
.month-item-list{display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto}
.month-item{background:var(--light);padding:12px;border-radius:8px;border:2px solid var(--border);transition:all .2s}.month-item.edited{border-color:var(--warning);background:#fef3c7}.month-item.new{border-color:var(--secondary);background:#fce7f3}
.month-item-header{display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:8px}.month-item-info{flex:1;min-width:0}.month-item-name{font-size:13px;font-weight:600;margin-bottom:2px}.month-item-details{font-size:11px;color:var(--text-secondary)}.month-item-value{font-size:16px;font-weight:700;color:var(--primary);flex-shrink:0}
.month-item-actions{display:flex;gap:4px;padding-top:8px;border-top:1px solid var(--border)}
.edit-btn{background:var(--warning);color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;flex:1}.remove-btn{background:var(--danger);color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;flex:1}
.add-item-btn{background:var(--success);color:#fff;border:none;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px}
.chart-container{background:#fff;border-radius:var(--radius);padding:16px;margin-bottom:16px;box-shadow:var(--shadow)}.chart-header{font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)}
.install-button{margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%;box-shadow:var(--shadow);transition:all .2s;animation:pulse 2s infinite}
.install-button:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg)}
.install-button:active{transform:scale(.98)}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.4)}50%{box-shadow:0 0 0 10px rgba(16,185,129,0)}}
@media (min-width:768px){.modal-content{border-radius:20px;max-height:85vh}.modal-overlay{align-items:center;padding:20px}.timeline-months{justify-content:center;flex-wrap:wrap}.balance-details{grid-template-columns:repeat(4,1fr)}}
.daily-flow-list{display:flex;flex-direction:column;gap:8px;max-height:500px;overflow-y:auto}
.daily-flow-item{background:var(--light);padding:12px;border-radius:8px;border:2px solid var(--border);transition:all .2s}
.daily-flow-item.has-movement{background:#fff;border-color:var(--primary)}
.daily-flow-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.daily-flow-date{flex:1}
.daily-flow-day{font-size:13px;font-weight:600;color:var(--text-primary);text-transform:capitalize}
.daily-flow-balance{font-size:18px;font-weight:700;text-align:right}
.daily-flow-balance.positive{color:var(--success)}
.daily-flow-balance.negative{color:var(--danger)}
.daily-flow-movements{display:flex;flex-direction:column;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.daily-flow-movement{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px;border-radius:6px;background:var(--light)}
.daily-flow-movement.entrada{background:#dcfce7}
.daily-flow-movement.saida{background:#fee2e2}
.movement-icon{font-size:14px;flex-shrink:0}
.movement-desc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.movement-value{font-weight:700;flex-shrink:0}
.movement-value.positive{color:var(--success)}
.movement-value.negative{color:var(--danger)}
.daily-flow-totals{display:flex;gap:12px;justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;font-weight:600}
.total-in{color:var(--success)}
.total-out{color:var(--danger)}
</style>
</head>
<body>
  <div class="toast-container" id="toastContainer"></div>

<div class="login-container" id="loginContainer">
    <div class="login-card">
        <div class="login-header">
            <h1> Minhas Finanças </h1>
            <p>Planejamento inteligente mês a mês</p>
        </div>
        <div class="login-tabs">
            <button class="login-tab active" onclick="switchLoginTab('login')">Entrar</button>
            <button class="login-tab" onclick="switchLoginTab('register')">Cadastrar</button>
        </div>
        <form id="loginForm" class="login-form">
            <div class="form-group">
                <label class="form-label">📧 E-mail</label>
                <input type="email" class="form-input" id="loginEmail" placeholder="seu@email.com" required autocomplete="email">
            </div>
            <div class="form-group">
                <label class="form-label">🔒 Senha</label>
                <input type="password" class="form-input" id="loginPassword" placeholder="Sua senha" required autocomplete="current-password">
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="loginRemember" checked>
                <label class="checkbox-label" for="loginRemember">Manter conectado (30 dias)</label>
            </div>
            <button type="submit" class="btn" id="loginBtn">Entrar</button>
        </form>
        <form id="registerForm" class="login-form" style="display:none">
            <div class="form-group">
                <label class="form-label">👤 Nome Completo</label>
                <input type="text" class="form-input" id="registerName" placeholder="João Silva" required>
            </div>
            <div class="form-group">
                <label class="form-label">📧 E-mail</label>
                <input type="email" class="form-input" id="registerEmail" placeholder="seu@email.com" required autocomplete="email">
            </div>
            <div class="form-group">
                <label class="form-label">🔒 Senha</label>
                <input type="password" class="form-input" id="registerPassword" placeholder="Mínimo 6 caracteres" minlength="6" required autocomplete="new-password">
            </div>
            <div class="form-group">
                <label class="form-label">🔒 Confirmar Senha</label>
                <input type="password" class="form-input" id="registerPasswordConfirm" placeholder="Digite novamente" required autocomplete="new-password">
            </div>
            <button type="submit" class="btn btn-success" id="registerBtn">Criar Conta</button>
        </form>
    </div>
</div>

<div class="app-container" id="appContainer">
    <div class="header">
        <div class="header-content">
            <h1> Finanças Avançadas</h1>
            <p>Planejamento mês a mês</p>
        </div>
        <div class="header-user">
            <div class="header-user-email" id="headerUserEmail"></div>
            <button class="btn-logout" onclick="logout()">Sair</button>
        </div>
    </div>
    
    <div class="balance-hero" id="balanceHero">
    <div class="balance-label">Saldo Projetado Final</div>
    <div class="balance-amount" id="balanceAmount">R$ 0,00</div>
    <div class="balance-details">
        <div class="balance-item">
            <div class="balance-icon">📥</div>
            <div>
                <div class="balance-item-label">Receitas</div>
                <div class="balance-item-value" id="totalIncome">R$ 0,00</div>
            </div>
        </div>
        <div class="balance-item">
            <div class="balance-icon">📤</div>
            <div>
                <div class="balance-item-label">Despesas</div>
                <div class="balance-item-value" id="totalExpenses">R$ 0,00</div>
            </div>
        </div>
    </div>
    <button class="btn btn-sm" style="margin-top: 12px; width: 100%; background: rgba(255,255,255,0.3); color: #fff; border: 2px solid rgba(255,255,255,0.5);" onclick="ajustarSaldoAtual()">
        💰 Ajustar Saldo Atual
    </button>
</div>

    <nav class="nav-tabs">
        <button class="nav-tab active" onclick="switchTab(event,'planning')">📋 Planejamento</button>
        <button class="nav-tab" onclick="switchTab(event,'expenses')">💳 Gastos</button>
        <button class="nav-tab" onclick="switchTab(event,'installments')">📅 Parcelas</button>
        <button class="nav-tab" onclick="switchTab(event,'recurring')">📌 Fixos</button>
        <button class="nav-tab" onclick="switchTab(event,'income')">💵 Renda</button>
        <button class="nav-tab" onclick="switchTab(event,'goals')">🎯 Metas</button>
        <button class="nav-tab" onclick="switchTab(event,'history')">📊 Histórico</button>
    </nav>

    <div class="content-area">
        <section id="planning" class="section active">
            <div id="planningActiveSection"></div>
            <div class="section-header">
                <h3 class="section-title">📋 Meus Planejamentos</h3>
                <button class="btn btn-sm" onclick="showNewPlanningModal()">➕ Novo</button>
            </div>
            <!-- Próximos Eventos -->
<div id="upcomingEventsSection" style="display:none;">
    <div class="timeline-container" style="margin-top: 16px;">
        <div class="timeline-header">📅 Próximos Eventos</div>
        <div id="upcomingEventsList" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 8px 0;">
            <!-- Eventos serão inseridos aqui -->
        </div>
    </div>
</div>
            <div id="planningList"></div>
        </section>

        <section id="expenses" class="section">
            <div class="alert alert-info">
                <span>ℹ️</span>
                <span>Gerencie seus gastos avulsos e acompanhe o que já foi pago</span>
            </div>
            <div class="form-section">
                <div class="form-header">
                    <div class="form-header-icon">💳</div>
                    <h2>Adicionar Gasto</h2>
                </div>
                <form id="formExpense">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">📝 Descrição</label>
                            <input type="text" class="form-input" id="expenseDesc" placeholder="Ex: Mercado" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">💰 Valor</label>
                                <input type="number" class="form-input" id="expenseValue" placeholder="0,00" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">📅 Data</label>
                                <input type="date" class="form-input" id="expenseDate" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">📂 Categoria</label>
                            <select class="form-select" id="expenseCategory" required></select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">📋 Observações</label>
                            <textarea class="form-textarea" id="expenseNotes" placeholder="Detalhes..."></textarea>
                        </div>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" class="checkbox-input" id="expensePaid">
                            <label class="checkbox-label" for="expensePaid">✅ Já pago</label>
                        </div>
                    </div>
                    <button type="submit" class="btn">Adicionar</button>
                </form>
            </div>
            <div class="section-header">
                <h3 class="section-title">📜 Histórico</h3>
            </div>
            <div id="expensesList"></div>
        </section>

        <section id="installments" class="section">
            <div class="form-section">
                <div class="form-header">
                    <div class="form-header-icon">📅</div>
                    <h2>Nova Compra Parcelada</h2>
                </div>
                <form id="formInstallment">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">📝 Descrição</label>
                            <input type="text" class="form-input" id="installmentDesc" placeholder="Ex: Notebook" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">💰 Valor Total</label>
                                <input type="number" class="form-input" id="installmentTotal" placeholder="0,00" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">📊 Parcelas</label>
                                <input type="number" class="form-input" id="installmentCount" min="2" placeholder="12" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">📅 Data 1ª Parcela</label>
                            <input type="date" class="form-input" id="installmentStart" required>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-secondary">Cadastrar</button>
                </form>
            </div>
            <div class="section-header">
                <h3 class="section-title">📜 Parcelamentos</h3>
            </div>
            <div id="installmentsList"></div>
        </section>

        <section id="recurring" class="section">
            <div class="form-section">
                <div class="form-header">
                    <div class="form-header-icon">📌</div>
                    <h2>Novo Custo Fixo</h2>
                </div>
                <form id="formRecurring">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">📝 Descrição</label>
                            <input type="text" class="form-input" id="recurringDesc" placeholder="Ex: Aluguel" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">💰 Valor</label>
                                <input type="number" class="form-input" id="recurringValue" placeholder="0,00" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">📅 Dia Venc.</label>
                                <input type="number" class="form-input" id="recurringDay" min="1" max="31" placeholder="5" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">📂 Categoria</label>
                            <select class="form-select" id="recurringCategory" required></select>
                        </div>
                    </div>
                    <button type="submit" class="btn">Cadastrar</button>
                </form>
            </div>
            <div class="section-header">
                <h3 class="section-title">📜 Custos Fixos</h3>
            </div>
            <div id="recurringList"></div>
        </section>

        <section id="income" class="section">
            <div class="form-section">
                <div class="form-header">
                    <div class="form-header-icon">💵</div>
                    <h2>Nova Renda</h2>
                </div>
                <form id="formIncome">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">📝 Descrição</label>
                            <input type="text" class="form-input" id="incomeDesc" placeholder="Ex: Salário" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">💰 Valor</label>
                                <input type="number" class="form-input" id="incomeValue" placeholder="0,00" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">📅 Data</label>
                                <input type="date" class="form-input" id="incomeDate" required>
                            </div>
                        </div>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" class="checkbox-input" id="incomeRecurring">
                            <label class="checkbox-label" for="incomeRecurring">🔄 Recorrente (aparece em todos os meses)</label>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-success">Adicionar</button>
                </form>
            </div>
            <div class="section-header">
                <h3 class="section-title">📜 Rendas</h3>
            </div>
            <div id="incomeList"></div>
        </section>

        <section id="goals" class="section">
            <div class="form-section">
                <div class="form-header">
                    <div class="form-header-icon">🎯</div>
                    <h2>Nova Meta</h2>
                </div>
                <form id="formGoal">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">📝 Nome</label>
                            <input type="text" class="form-input" id="goalName" placeholder="Ex: Viagem" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">💰 Valor</label>
                                <input type="number" class="form-input" id="goalTotal" placeholder="0,00" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">📅 Data</label>
                                <input type="date" class="form-input" id="goalDate">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">💵 Economizado</label>
                            <input type="number" class="form-input" id="goalCurrent" placeholder="0,00" step="0.01" value="0">
                        </div>
                    </div>
                    <button type="submit" class="btn">Criar</button>
                </form>
            </div>
            <div class="section-header">
                <h3 class="section-title">📜 Metas</h3>
            </div>
            <div id="goalsList"></div>
        </section>

        <section id="history" class="section">
            <div class="chart-container">
                <div class="chart-header">📊 Gastos por Categoria</div>
                <canvas id="categoryChart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-header">📈 Evolução</div>
                <canvas id="monthlyChart"></canvas>
            </div>
        </section>
    </div>
</div>

<!-- Modais -->
<div class="modal-overlay" id="newPlanningModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">📋 Novo Planejamento</h3>
            <button class="btn-close" onclick="closeModal('newPlanningModal')">✕</button>
        </div>
        <form id="formNewPlanning">
            <div class="modal-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">📝 Nome</label>
                        <input type="text" class="form-input" id="planName" placeholder="Planejamento 2025" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">💰 Saldo Inicial</label>
                        <input type="number" class="form-input" id="planBalance" placeholder="0,00" step="0.01" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">📅 Início</label>
                            <input type="date" class="form-input" id="planStartDate" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">📅 Fim</label>
                            <input type="date" class="form-input" id="planEndDate" required>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal('newPlanningModal')">Cancelar</button>
                <button type="submit" class="btn">Criar</button>
            </div>
        </form>
    </div>
</div>

<div class="modal-overlay" id="monthDetailsModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title" id="monthDetailsTitle">📅 Detalhes</h3>
            <button class="btn-close" onclick="closeModal('monthDetailsModal')">✕</button>
        </div>
        <div class="modal-body">
            <div class="item-type-tabs">
    <button class="item-type-tab active" onclick="switchItemType('fluxo')">📊 Fluxo Diário</button>
    <button class="item-type-tab" onclick="switchItemType('fixos')">📌 Fixos</button>
    <button class="item-type-tab" onclick="switchItemType('rendas')">💵 Rendas</button>
    <button class="item-type-tab" onclick="switchItemType('parcelados')">📅 Parcelas</button>
    <button class="item-type-tab" onclick="switchItemType('gastos')">💳 Gastos</button>
    <button class="item-type-tab" onclick="switchItemType('metas')">🎯 Metas</button>
        </div>
            <div id="monthItemsContainer"></div>
            <button class="add-item-btn" onclick="showAddItemModal()">➕ Adicionar</button>
        </div>
    </div>
</div>

<div class="modal-overlay" id="editItemModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title" id="editItemTitle">✏️ Editar</h3>
            <button class="btn-close" onclick="closeModal('editItemModal')">✕</button>
        </div>
        <form id="formEditItem">
            <div class="modal-body">
                <div class="form-grid" id="editItemContent"></div>
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="checkbox-input" id="applyToFuture">
                    <label class="checkbox-label" for="applyToFuture">🔄 Aplicar aos meses posteriores</label>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal('editItemModal')">Cancelar</button>
                <button type="submit" class="btn">Salvar</button>
            </div>
        </form>
    </div>
</div>

<div class="modal-overlay" id="editGlobalModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title" id="editGlobalTitle">✏️ Editar</h3>
            <button class="btn-close" onclick="closeModal('editGlobalModal')">✕</button>
        </div>
        <form id="formEditGlobal">
            <div class="modal-body">
                <div class="form-grid" id="editGlobalContent"></div>
                <div class="checkbox-wrapper" id="editGlobalCheckboxContainer" style="display:none">
                    <input type="checkbox" class="checkbox-input" id="applyToFuturePlanning">
                    <label class="checkbox-label" for="applyToFuturePlanning">🔄 Aplicar aos meses futuros do planejamento</label>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal('editGlobalModal')">Cancelar</button>
                <button type="submit" class="btn btn-warning">Salvar Alterações</button>
            </div>
        </form>
    </div>
</div>

<div class="modal-overlay" id="addItemModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title" id="addItemModalTitle">➕ Adicionar</h3>
            <button class="btn-close" onclick="closeModal('addItemModal')">✕</button>
        </div>
        <form id="formAddItem">
            <div class="modal-body">
                <div class="form-grid" id="addItemFormContent"></div>
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="checkbox-input" id="addToFuture" checked>
                    <label class="checkbox-label" for="addToFuture">🔄 Incluir nos meses posteriores</label>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal('addItemModal')">Cancelar</button>
                <button type="submit" class="btn btn-success">Adicionar</button>
            </div>
        </form>
    </div>
</div>

<div class="modal-overlay" id="adjustBalanceModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">💰 Ajustar Saldo Atual</h3>
            <button class="btn-close" onclick="closeModal('adjustBalanceModal')">✕</button>
        </div>
        <form id="formAdjustBalance">
            <div class="modal-body">
                <div class="alert alert-info">
                    <span>ℹ️</span>
                    <span>Ajuste o saldo atual para refletir quanto você realmente tem agora. O planejamento será recalculado a partir deste mês.</span>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">📅 Ajustar a partir de qual mês?</label>
                        <select class="form-select" id="adjustMonth" required>
                            <!-- Será preenchido dinamicamente -->
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">💰 Novo Saldo Real</label>
                        <input type="number" class="form-input" id="adjustNewBalance" placeholder="0,00" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">📝 Motivo do Ajuste (opcional)</label>
                        <textarea class="form-textarea" id="adjustReason" placeholder="Ex: Gastos não lançados, correção de saldo..."></textarea>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="closeModal('adjustBalanceModal')">Cancelar</button>
                <button type="submit" class="btn btn-warning">💰 Ajustar Saldo</button>
            </div>
        </form>
    </div>
</div>

<script>
console.log('🚀 ========== SISTEMA INICIANDO ==========');

// ========== VARIÁVEIS GLOBAIS ==========
let currentUser = null;
let sessionData = null;
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

let appData = {
    gastos: [],
    rendas: [],
    fixos: [],
    metas: [],
    parcelados: [],
    planejamentos: [],
    categorias: []
};
let activePlanning = null;
let selectedMonth = null;
let currentItemType = 'fixos';
let editingItem = null;
let charts = { category: null, monthly: null };


// ========== PWA - MANIFEST DINÂMICO ==========
function criarManifest() {
    const manifest = {
        "name": "Finanças Avançadas",
        "short_name": "Finanças",
        "description": "Sistema completo de gestão financeira pessoal",
        "start_url": window.location.href,
        "display": "standalone",
        "background_color": "#667eea",
        "theme_color": "#6366f1",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect fill='%236366f1' width='192' height='192' rx='48'/%3E%3Ctext x='96' y='140' font-size='120' text-anchor='middle' fill='white'%3E💰%3C/text%3E%3C/svg%3E",
                "sizes": "192x192",
                "type": "image/svg+xml",
                "purpose": "any maskable"
            },
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect fill='%236366f1' width='512' height='512' rx='128'/%3E%3Ctext x='256' y='380' font-size='320' text-anchor='middle' fill='white'%3E💰%3C/text%3E%3C/svg%3E",
                "sizes": "512x512",
                "type": "image/svg+xml",
                "purpose": "any maskable"
            }
        ]
    };
    
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestURL = URL.createObjectURL(manifestBlob);
    document.getElementById('manifestPlaceholder').setAttribute('href', manifestURL);
    
    const iconSVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect fill='%236366f1' width='192' height='192' rx='48'/%3E%3Ctext x='96' y='140' font-size='120' text-anchor='middle' fill='white'%3E💰%3C/text%3E%3C/svg%3E";
    
    document.getElementById('icon192').setAttribute('href', iconSVG);
    document.getElementById('icon512').setAttribute('href', iconSVG);
    document.getElementById('appleTouchIcon').setAttribute('href', iconSVG);
    
    console.log('✅ Manifest criado');
}

// ========== PWA - SERVICE WORKER ==========
function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        const swCode = `
            const CACHE_NAME = 'financas-v1';
            self.addEventListener('install', (event) => {
                console.log('✅ Service Worker instalado');
                self.skipWaiting();
            });
            self.addEventListener('activate', (event) => {
                console.log('✅ Service Worker ativado');
                event.waitUntil(clients.claim());
            });
            self.addEventListener('fetch', (event) => {
                event.respondWith(
                    caches.match(event.request).then((response) => {
                        return response || fetch(event.request);
                    })
                );
            });
        `;
        
        const blob = new Blob([swCode], { type: 'application/javascript' });
        const swURL = URL.createObjectURL(blob);
        
        navigator.serviceWorker.register(swURL)
            .then(reg => console.log('✅ Service Worker registrado'))
            .catch(err => console.warn('⚠️ Service Worker falhou:', err));
    }
}

// ========== PWA - BOTÃO DE INSTALAÇÃO ==========
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 App pode ser instalado!');
    e.preventDefault();
    deferredPrompt = e;
    mostrarBotaoInstalar();
});

function mostrarBotaoInstalar() {
    if (!document.getElementById('installButton')) {
        const installBtn = document.createElement('button');
        installBtn.id = 'installButton';
        installBtn.className = 'install-button';
        installBtn.innerHTML = '📱 Instalar App';
        installBtn.onclick = instalarApp;
        
        const loginCard = document.querySelector('.login-card');
        if (loginCard) {
            loginCard.appendChild(installBtn);
        }
    }
}

function instalarApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('✅ App instalado!');
                showToast('Sucesso', 'App instalado com sucesso!', 'success');
            }
            deferredPrompt = null;
            const btn = document.getElementById('installButton');
            if (btn) btn.remove();
        });
    }
}

window.addEventListener('appinstalled', () => {
    console.log('✅ App instalado no dispositivo');
    showToast('Instalado!', 'O app está pronto para uso offline', 'success');
});

// ========== VERIFICAÇÃO DO GOOGLE APPS SCRIPT ==========
function verificarGoogleScript() {
    if (typeof google === 'undefined' || !google.script || !google.script.run) {
        console.error('❌ Google Apps Script NÃO disponível');
        showToast('Erro', 'Sistema não conectado ao Google Sheets', 'error');
        return false;
    }
    console.log('✅ Google Apps Script disponível');
    return true;
}

// ========== INICIALIZAÇÃO ==========
window.addEventListener('load', function() {
    console.log('✅ Window loaded');
    
    criarManifest();
    registrarServiceWorker();
    
    setTimeout(() => {
        if (verificarGoogleScript()) {
            inicializarSistema();
        } else {
            showToast('Aviso', 'Abra via: 💰 Finanças > 🚀 Abrir App', 'warning');
        }
    }, 500);
});

function inicializarSistema() {
    console.log('🔧 Inicializando sistema...');
    registrarEventListeners();
    setTimeout(() => tentarLoginAutomatico(), 1000);
}

// ========== FUNÇÕES DE SESSÃO ==========
function salvarSessaoLocal(user) {
    const session = {
        email: user.email,
        nome: user.nome,
        timestamp: new Date().getTime(),
        autoLogin: true
    };
    try {
        localStorage.setItem('financas_session', JSON.stringify(session));
        sessionData = session;
        console.log('💾 Sessão salva');
    } catch (e) {
        console.error('Erro ao salvar sessão:', e);
    }
}

function carregarSessaoLocal() {
    try {
        const sessionStr = localStorage.getItem('financas_session');
        if (!sessionStr) return null;
        
        const session = JSON.parse(sessionStr);
        const now = new Date().getTime();
        
        if (now - session.timestamp > SESSION_DURATION) {
            limparSessaoLocal();
            return null;
        }
        
        sessionData = session;
        return session;
    } catch (e) {
        return null;
    }
}

function limparSessaoLocal() {
    try {
        localStorage.removeItem('financas_session');
        sessionData = null;
        console.log('🗑️ Sessão limpa');
    } catch (e) {
        console.error('Erro ao limpar sessão:', e);
    }
}

function switchLoginTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.login-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        tabs[0].classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        tabs[1].classList.add('active');
    }
}

// ========== AUTENTICAÇÃO ==========
function registrarEventListeners() {
    console.log('📝 Registrando event listeners...');
    
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        console.log('🔐 Login iniciado');
        
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('loginRemember').checked;
        const btn = document.getElementById('loginBtn');
        if (!email || !password) {
        showToast('Erro', 'Preencha todos os campos', 'warning');
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Conectando...';
    
    console.log('📡 Chamando fazerLogin...');
    
    google.script.run
        .withSuccessHandler(function(resultado) {
            console.log('📥 Resposta:', resultado);
            btn.disabled = false;
            btn.textContent = 'Entrar';
            
            if (resultado && resultado.success && resultado.user) {
                console.log('✅ Login bem-sucedido!');
                currentUser = resultado.user;
                
                if (rememberMe) {
                    salvarSessaoLocal(currentUser);
                }
                
                showApp();
                showToast('Bem-vindo!', `Olá, ${currentUser.nome}`, 'success');
            } else {
                console.error('❌ Login falhou');
                showToast('Erro', resultado ? resultado.message : 'Credenciais incorretas', 'error');
            }
        })
        .withFailureHandler(function(erro) {
            console.error('❌ Erro:', erro);
            btn.disabled = false;
            btn.textContent = 'Entrar';
            showToast('Erro', 'Falha ao conectar: ' + erro.message, 'error');
        })
        .fazerLogin(email, password);
});

const registerForm = document.getElementById('registerForm');
registerForm.addEventListener('submit', function(e) {
    e.preventDefault();
    console.log('📝 Cadastro iniciado');
    
    const nome = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const senha = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerPasswordConfirm').value;
    const btn = document.getElementById('registerBtn');
    
    if (!nome || !email || !senha || !confirm) {
        showToast('Erro', 'Preencha todos os campos', 'warning');
        return;
    }
    
    if (senha !== confirm) {
        showToast('Erro', 'Senhas não conferem', 'warning');
        return;
    }
    
    if (senha.length < 6) {
        showToast('Erro', 'Senha deve ter no mínimo 6 caracteres', 'warning');
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Criando...';
    
    console.log('📡 Chamando criarUsuario...');
    
    google.script.run
        .withSuccessHandler(function(resultado) {
            console.log('📥 Resposta:', resultado);
            btn.disabled = false;
            btn.textContent = 'Criar Conta';
            
            if (resultado && resultado.success) {
                console.log('✅ Cadastro bem-sucedido!');
                switchLoginTab('login');
                document.getElementById('loginEmail').value = email;
                showToast('Sucesso', 'Conta criada! Faça login.', 'success');
            } else {
                console.error('❌ Cadastro falhou');
                showToast('Erro', resultado ? resultado.message : 'Erro ao criar conta', 'error');
            }
        })
        .withFailureHandler(function(erro) {
            console.error('❌ Erro:', erro);
            btn.disabled = false;
            btn.textContent = 'Criar Conta';
            showToast('Erro', 'Falha ao conectar: ' + erro.message, 'error');
        })
        .criarUsuario(nome, email, senha);
});

console.log('✅ Event listeners registrados');
}
function tentarLoginAutomatico() {
console.log('🔍 Tentando login automático...');
const sessaoLocal = carregarSessaoLocal();

if (!sessaoLocal || !sessaoLocal.autoLogin) {
    console.log('ℹ️ Sem sessão local');
    document.getElementById('loginContainer').style.display = 'flex';
    return;
}

console.log('📡 Verificando sessão:', sessaoLocal.email);

google.script.run
    .withSuccessHandler(function(resultado) {
        console.log('📥 Resultado:', resultado);
        
        if (resultado && resultado.success && resultado.user) {
            console.log('✅ Sessão válida!');
            currentUser = resultado.user;
            showApp();
        } else {
            console.log('❌ Sessão inválida');
            limparSessaoLocal();
            document.getElementById('loginContainer').style.display = 'flex';
        }
    })
    .withFailureHandler(function(erro) {
        console.error('❌ Erro:', erro);
        limparSessaoLocal();
        document.getElementById('loginContainer').style.display = 'flex';
    })
    .verificarUsuarioExiste(sessaoLocal.email);
}
function showApp() {
console.log('🚀 Exibindo app...');
if (!currentUser || !currentUser.email) {
    console.error('❌ Dados inválidos!');
    showToast('Erro', 'Erro ao carregar usuário', 'error');
    return;
}

document.getElementById('loginContainer').style.display = 'none';
document.getElementById('appContainer').classList.add('logged-in');
document.getElementById('headerUserEmail').textContent = currentUser.email;

loadData();
console.log('✅ App exibido');
}
function logout() {
console.log('🚪 Logout...');
limparSessaoLocal();
currentUser = null;
appData = {
gastos: [],
rendas: [],
fixos: [],
metas: [],
parcelados: [],
planejamentos: [],
categorias: []
};
document.getElementById('appContainer').classList.remove('logged-in');
document.getElementById('loginContainer').style.display = 'flex';
document.getElementById('loginForm').reset();

showToast('Até logo!', 'Você saiu da conta', 'success');
}
function loadData() {
console.log('📡 Carregando dados...');
google.script.run
    .withSuccessHandler(dados => {
        console.log('📥 Dados recebidos:', dados);
        appData = dados;
        processData();
        console.log('✅ Dados processados');
    })
    .withFailureHandler(erro => {
        console.error('❌ Erro ao carregar:', erro);
        showToast('Erro', 'Erro ao carregar dados', 'error');
    })
    .carregarDadosUsuario();
}
console.log('✅ Sistema de autenticação carregado');

// ========== SOLUÇÃO DEFINITIVA - FUNÇÃO callBackend CORRIGIDA ==========

function callBackend(action, type, data) {
    return new Promise((resolve, reject) => {
        // ✅ Mapeamento explícito de todas as combinações action + type
        const functionMap = {
            // GASTOS
            'adicionar-gastos': 'adicionarGasto',
            'atualizar-gastos': 'atualizarGasto',
            'excluir-gastos': 'excluirGasto',
            
            // RENDAS
            'adicionar-rendas': 'adicionarRenda',
            'atualizar-rendas': 'atualizarRenda',
            'excluir-rendas': 'excluirRenda',
            
            // FIXOS
            'adicionar-fixos': 'adicionarFixo',
            'atualizar-fixos': 'atualizarFixo',
            'excluir-fixos': 'excluirFixo',
            
            // METAS
            'adicionar-metas': 'adicionarMeta',
            'atualizar-metas': 'atualizarMeta',
            'excluir-metas': 'excluirMeta',
            
            // PARCELADOS
            'adicionar-parcelados': 'adicionarParcelado',
            'atualizar-parcelados': 'atualizarParcelado',
            'excluir-parcelados': 'excluirParcelado',
            
            // PLANEJAMENTOS
            'adicionar-planejamentos': 'adicionarPlanejamento',
            'atualizar-planejamentos': 'atualizarPlanejamento',
            'excluir-planejamentos': 'excluirPlanejamento',
            
            // CICLOS
            'adicionar-ciclos': 'adicionarCiclo',
            'atualizar-ciclos': 'atualizarCiclo',
            'excluir-ciclos': 'excluirCiclo',
            
            // CATEGORIAS
            'adicionar-categorias': 'adicionarCategoria'
        };
        
        // Criar chave combinada
        const key = `${action}-${type}`;
        const functionName = functionMap[key];
        
        if (!functionName) {
            const errorMsg = `❌ Função não encontrada para: ${action} + ${type}`;
            console.error(errorMsg);
            console.error('Chave procurada:', key);
            console.error('Funções disponíveis:', Object.keys(functionMap));
            showToast('Erro', errorMsg, 'error');
            reject(new Error(errorMsg));
            return;
        }
        
        console.log(`📡 Chamando ${functionName}...`, data);
        
        // ✅ Agora chamamos a função corretamente
        google.script.run
            .withSuccessHandler(result => {
                console.log(`✅ ${functionName} concluído:`, result);
                
                if (result === false || (result && result.success === false)) {
                    const errorMsg = result.message || 'Falha ao salvar';
                    console.error(`❌ ${functionName} retornou falha:`, errorMsg);
                    showToast('Erro', errorMsg, 'error');
                    reject(new Error(errorMsg));
                    return;
                }
                
                resolve(result);
            })
            .withFailureHandler(error => {
                console.error(`❌ Erro em ${functionName}:`, error);
                showToast('Erro', `Falha ao salvar: ${error.message}`, 'error');
                reject(error);
            })
            [functionName](data);  // ✅ Agora podemos usar colchetes porque sabemos que a função existe
    });
}

// ========== NAVEGAÇÃO E UI ==========
function switchTab(event, tabId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    if (tabId === 'history') updateHistory();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function setTodayDates() {
    const today = new Date().toISOString().split('T')[0];
    ['expenseDate', 'incomeDate', 'goalDate', 'installmentStart', 'planStartDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });
}

function processData() {
    activePlanning = appData.planejamentos.find(p => p.ativo) || null;
    if (activePlanning) {
        try {
            if (typeof activePlanning.dadosJSON === 'string') {
                const parsed = JSON.parse(activePlanning.dadosJSON);
                activePlanning.items = parsed.items || {};
            } else {
                activePlanning.items = {};
            }
        } catch (e) { 
            activePlanning.items = {}; 
        }
        syncGlobalDataToPlan();
    }
    updateCategories();
    setTodayDates();
    updateAll();
}

// ========== SINCRONIZAÇÃO GLOBAL → PLANEJAMENTO ==========
function syncGlobalDataToPlan() {
    if (!activePlanning) return;
    
    const months = getMonthsInPlan();
    const start = new Date(activePlanning.dataInicio);
    const end = new Date(activePlanning.dataFim);

    if (!activePlanning.items) activePlanning.items = {};
    months.forEach(m => {
        if (!activePlanning.items[m.key]) {
            activePlanning.items[m.key] = {
                fixos: [], rendas: [], parcelados: [], gastos: [], metas: []
            };
        }
    });

    // FIXOS
    appData.fixos.forEach(fixo => {
        if (fixo.ativo && !fixo.idPlanejamento) {
            months.forEach(m => {
                const existingIndex = activePlanning.items[m.key].fixos.findIndex(
                    f => f.id === fixo.id
                );
                
                if (existingIndex !== -1) {
                    const existing = activePlanning.items[m.key].fixos[existingIndex];
                    
                    if (existing.valorEditado === undefined && existing.incluido !== false) {
                        const customFields = {
                            incluido: existing.incluido,
                            valorEditado: existing.valorEditado,
                            dataEditada: existing.dataEditada,
                            novo: existing.novo
                        };
                        
                        Object.assign(existing, fixo, customFields, { fromGlobal: true });
                    }
                } else {
                    activePlanning.items[m.key].fixos.push({ 
                        ...fixo, 
                        incluido: true, 
                        fromGlobal: true 
                    });
                }
            });
        }
    });

    // RENDAS RECORRENTES
    appData.rendas.forEach(renda => {
        if (!renda.idPlanejamento && renda.recorrente) {
            months.forEach(m => {
                const existingIndex = activePlanning.items[m.key].rendas.findIndex(
                    r => r.id === renda.id
                );
                
                if (existingIndex !== -1) {
                    const existing = activePlanning.items[m.key].rendas[existingIndex];
                    
                    if (existing.valorEditado === undefined && existing.incluido !== false) {
                        const customFields = {
                            incluido: existing.incluido,
                            valorEditado: existing.valorEditado,
                            dataEditada: existing.dataEditada,
                            novo: existing.novo
                        };
                        
                        Object.assign(existing, renda, customFields, { fromGlobal: true });
                    }
                } else {
                    activePlanning.items[m.key].rendas.push({ 
                        ...renda, 
                        incluido: true, 
                        fromGlobal: true 
                    });
                }
            });
        }
    });

    // RENDAS AVULSAS
    appData.rendas.forEach(renda => {
        if (!renda.idPlanejamento && !renda.recorrente) {
            const rendaDate = new Date(renda.data);
            if (rendaDate >= start && rendaDate <= end) {
                const monthKey = `${rendaDate.getFullYear()}-${String(rendaDate.getMonth() + 1).padStart(2, '0')}`;
                
                if (activePlanning.items[monthKey]) {
                    const existingIndex = activePlanning.items[monthKey].rendas.findIndex(
                        r => r.id === renda.id
                    );
                    
                    if (existingIndex !== -1) {
                        const existing = activePlanning.items[monthKey].rendas[existingIndex];
                        
                        if (existing.valorEditado === undefined && existing.incluido !== false) {
                            const customFields = {
                                incluido: existing.incluido,
                                valorEditado: existing.valorEditado,
                                dataEditada: existing.dataEditada,
                                novo: existing.novo
                            };
                            
                            Object.assign(existing, renda, customFields, { fromGlobal: true });
                        }
                    } else {
                        activePlanning.items[monthKey].rendas.push({ 
                            ...renda, 
                            incluido: true, 
                            fromGlobal: true,
                            tipo: 'avulsa'
                        });
                    }
                }
            }
        }
    });

    // PARCELADOS
    appData.parcelados.forEach(parc => {
        if (!parc.idPlanejamento) {
            const startDate = new Date(parc.dataInicio);
            let current = new Date(startDate);
            
            for (let i = 0; i < parc.parcelas; i++) {
                if (current >= start && current <= end) {
                    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                    
                    if (activePlanning.items[monthKey]) {
                        const existingIndex = activePlanning.items[monthKey].parcelados.findIndex(
                            p => p.id === parc.id && p.numeroParcela === (i + 1)
                        );
                        
                        if (existingIndex !== -1) {
                            const existing = activePlanning.items[monthKey].parcelados[existingIndex];
                            
                            if (existing.valorEditado === undefined && existing.incluido !== false) {
                                const customFields = {
                                    incluido: existing.incluido,
                                    valorEditado: existing.valorEditado,
                                    numeroParcela: existing.numeroParcela,
                                    novo: existing.novo
                                };
                                
                                Object.assign(existing, parc, customFields, { fromGlobal: true });
                            }
                        } else {
                            activePlanning.items[monthKey].parcelados.push({ 
                                ...parc, 
                                numeroParcela: i + 1,
                                incluido: true, 
                                fromGlobal: true 
                            });
                        }
                    }
                }
                current.setMonth(current.getMonth() + 1);
            }
        }
    });

    // GASTOS
    appData.gastos.forEach(gasto => {
        if (!gasto.idPlanejamento) {
            const gastoDate = new Date(gasto.data);
            if (gastoDate >= start && gastoDate <= end) {
                const monthKey = `${gastoDate.getFullYear()}-${String(gastoDate.getMonth() + 1).padStart(2, '0')}`;
                
                if (activePlanning.items[monthKey]) {
                    const existingIndex = activePlanning.items[monthKey].gastos.findIndex(
                        g => g.id === gasto.id
                    );
                    
                    if (existingIndex !== -1) {
                        const existing = activePlanning.items[monthKey].gastos[existingIndex];
                        
                        if (existing.valorEditado === undefined && existing.incluido !== false) {
                            const customFields = {
                                incluido: existing.incluido,
                                valorEditado: existing.valorEditado,
                                dataEditada: existing.dataEditada,
                                novo: existing.novo
                            };
                            
                            Object.assign(existing, gasto, customFields, { fromGlobal: true });
                        }
                    } else {
                        activePlanning.items[monthKey].gastos.push({ 
                            ...gasto, 
                            incluido: true, 
                            fromGlobal: true 
                        });
                    }
                }
            }
        }
    });

    // METAS
    appData.metas.filter(m => m.ativa !== false && !m.idPlanejamento).forEach(meta => {
        const monthlyValue = meta.valorTotal / months.length;
        
        months.forEach(m => {
            const existingIndex = activePlanning.items[m.key].metas.findIndex(
                mt => mt.id === meta.id
            );
            
            if (existingIndex !== -1) {
                const existing = activePlanning.items[m.key].metas[existingIndex];
                
                if (existing.valorEditado === undefined && existing.incluido !== false) {
                    const customFields = {
                        incluido: existing.incluido,
                        valorEditado: existing.valorEditado,
                        valorMensal: monthlyValue,
                        novo: existing.novo
                    };
                    
                    Object.assign(existing, meta, customFields, { fromGlobal: true });
                }
            } else {
                activePlanning.items[m.key].metas.push({ 
                    ...meta, 
                    valorMensal: monthlyValue,
                    incluido: true, 
                    fromGlobal: true 
                });
            }
        });
    });
    
    savePlanningData();
}

// ========== SINCRONIZAÇÃO ITEM → PLANEJAMENTO ==========
function syncItemToPlan(item, type, action) {
    if (!activePlanning) return;
    
    const months = getMonthsInPlan();
    const start = new Date(activePlanning.dataInicio);
    const end = new Date(activePlanning.dataFim);
    
    if (action === 'delete') {
        months.forEach(m => {
            const items = activePlanning.items[m.key][type];
            const idx = items.findIndex(i => i.id === item.id && i.fromGlobal);
            if (idx !== -1) {
                items.splice(idx, 1);
            }
        });
        savePlanningData();
        updateAll();
        return;
    }
    
    if (action === 'update') {
        months.forEach(m => {
            const items = activePlanning.items[m.key][type];
            const planItem = items.find(i => i.id === item.id && i.fromGlobal);
            if (planItem && planItem.valorEditado === undefined) {
                Object.assign(planItem, item, { 
                    incluido: planItem.incluido,
                    fromGlobal: true 
                });
            }
        });
        savePlanningData();
        updateAll();
        return;
    }
    
    if (action === 'add') {
        if (type === 'rendas') {
            if (item.recorrente) {
                months.forEach(m => {
                    const exists = activePlanning.items[m.key].rendas.find(r => r.id === item.id);
                    if (!exists) {
                        activePlanning.items[m.key].rendas.push({ 
                            ...item, 
                            incluido: true, 
                            fromGlobal: true 
                        });
                    }
                });
            } else {
                const itemDate = new Date(item.data);
                if (itemDate >= start && itemDate <= end) {
                    const monthKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;
                    if (activePlanning.items[monthKey]) {
                        activePlanning.items[monthKey].rendas.push({ 
                            ...item, 
                            incluido: true, 
                            fromGlobal: true 
                        });
                    }
                }
            }
        } else if (type === 'fixos') {
            months.forEach(m => {
                const exists = activePlanning.items[m.key].fixos.find(f => f.id === item.id);
                if (!exists) {
                    activePlanning.items[m.key].fixos.push({ 
                        ...item, 
                        incluido: true, 
                        fromGlobal: true 
                    });
                }
            });
        } else if (type === 'parcelados') {
            const startDate = new Date(item.dataInicio);
            let currentDate = new Date(startDate);
            
            for (let i = 0; i < item.parcelas; i++) {
                if (currentDate >= start && currentDate <= end) {
                    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                    if (activePlanning.items[monthKey]) {
                        const exists = activePlanning.items[monthKey].parcelados.find(
                            p => p.id === item.id && p.numeroParcela === (i + 1)
                        );
                        if (!exists) {
                            activePlanning.items[monthKey].parcelados.push({ 
                                ...item, 
                                numeroParcela: i + 1,
                                incluido: true, 
                                fromGlobal: true 
                            });
                        }
                    }
                }
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        } else if (type === 'gastos') {
            const itemDate = new Date(item.data);
            if (itemDate >= start && itemDate <= end) {
                const monthKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;
                if (activePlanning.items[monthKey]) {
                    activePlanning.items[monthKey].gastos.push({ 
                        ...item, 
                        incluido: true, 
                        fromGlobal: true 
                    });
                }
            }
        } else if (type === 'metas') {
            const monthlyValue = item.valorTotal / months.length;
            months.forEach(m => {
                const exists = activePlanning.items[m.key].metas.find(mt => mt.id === item.id);
                if (!exists) {
                    activePlanning.items[m.key].metas.push({ 
                        ...item, 
                        valorMensal: monthlyValue,
                        incluido: true, 
                        fromGlobal: true 
                    });
                }
            });
        }
        
        savePlanningData();
        updateAll();
    }
}

// ========== SINCRONIZAÇÃO PLANEJAMENTO → GLOBAL ==========
function syncPlanToGlobal(item, type, action) {
    if (action === 'edit' && item.fromGlobal) {
        const globalArray = appData[type];
        const globalItem = globalArray.find(i => i.id === item.id);
        
        if (globalItem) {
            if (item.valorEditado !== undefined) {
                globalItem.valor = item.valorEditado;
            }
            if (item.dataEditada) {
                globalItem.data = item.dataEditada;
            }
            
            callBackend('atualizar', type, globalItem);
            updateAll();
        }
    } else if (action === 'remove' && item.fromGlobal) {
        console.log(`Item ${item.id} removido do planejamento, mantido em appData`);
    }
}

function updateCategories() {
    const cats = appData.categorias.length ? appData.categorias : ['Mercado', 'Farmácia', 'Alimentação', 'Transporte', 'Luz', 'Água', 'Internet', 'Celular', 'Outros'];
    [document.getElementById('expenseCategory'), document.getElementById('recurringCategory')].forEach(sel => {
        if(sel) sel.innerHTML = '<option value="">Selecione...</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    })
}

function updateAll() {
    updateBalance();
    updatePlanning();
    renderUpcomingEvents();
    renderExpenses();
    renderIncome();
    renderRecurring();
    renderGoals();
    renderInstallments();
    updateHistory();
}

function getMonthsInPlan() {
    if (!activePlanning) return [];
    const start = new Date(activePlanning.dataInicio);
    const end = new Date(activePlanning.dataFim);
    const months = [];
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
        months.push({
            date: new Date(current),
            name: current.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
        });
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

function getItemsForMonth(monthKey) {
    if (!activePlanning || !activePlanning.items || !activePlanning.items[monthKey]) {
        return { fixos: [], rendas: [], parcelados: [], gastos: [], metas: [] };
    }
    return activePlanning.items[monthKey];
}

function calculateMonthBalance(monthKey) {
    const items = getItemsForMonth(monthKey);
    let receitas = 0;
    let despesas = 0;

    items.rendas.forEach(r => { 
        if (r.incluido !== false) {
            receitas += r.valorEditado !== undefined ? r.valorEditado : r.valor;
        }
    });
    
    items.gastos.forEach(g => { 
        if (g.incluido !== false) {
            despesas += g.valorEditado !== undefined ? g.valorEditado : g.valor;
        }
    });
    
    items.fixos.forEach(f => { 
        if (f.incluido !== false) {
            despesas += f.valorEditado !== undefined ? f.valorEditado : f.valor;
        }
    });
    
    items.parcelados.forEach(p => { 
        if (p.incluido !== false) { 
            const monthly = p.valorTotal / p.parcelas;
            despesas += p.valorEditado !== undefined ? p.valorEditado : monthly;
        }
    });
    
    items.metas.forEach(m => { 
        if (m.incluido !== false) { 
            const monthly = m.valorMensal || 0;
            despesas += m.valorEditado !== undefined ? m.valorEditado : monthly;
        }
    });

    return { receitas, despesas };
}

function calculatePlanningProjection() {
    if (!activePlanning) return null;
    const months = getMonthsInPlan();
    if (months.length === 0) return null;

    let saldoAcumulado = activePlanning.saldoInicial;
    
    months.forEach((month, idx) => {
        const balance = calculateMonthBalance(month.key);
        month.receitas = balance.receitas;
        month.despesas = balance.despesas;
        saldoAcumulado = saldoAcumulado + balance.receitas - balance.despesas;
        month.saldo = saldoAcumulado;
    });
    
    return months;
}
function calculateDailyFlow(monthKey) {
    if (!activePlanning) return [];
    
    const items = getItemsForMonth(monthKey);
    const months = getMonthsInPlan();
    const monthIndex = months.findIndex(m => m.key === monthKey);
    
    // Calcular saldo inicial do mês
    let saldoInicial = activePlanning.saldoInicial;
    
    if (monthIndex > 0) {
        // Se não é o primeiro mês, pegar saldo acumulado até o mês anterior
        for (let i = 0; i < monthIndex; i++) {
            const balance = calculateMonthBalance(months[i].key);
            saldoInicial = saldoInicial + balance.receitas - balance.despesas;
        }
    }
    
    // Extrair ano e mês
    const [ano, mes] = monthKey.split('-').map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    
    // Criar array de dias
    const dias = [];
    for (let dia = 1; dia <= ultimoDia; dia++) {
        dias.push({
            dia: dia,
            data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
            entradas: [],
            saidas: [],
            saldo: 0
        });
    }
    
    // Função auxiliar para ajustar dia ao mês
    function ajustarDiaAoMes(diaOriginal, ultimoDiaDoMes) {
        if (diaOriginal === 31 && ultimoDiaDoMes < 31) {
            return ultimoDiaDoMes;
        }
        if (diaOriginal > ultimoDiaDoMes) {
            return ultimoDiaDoMes;
        }
        return diaOriginal;
    }
    
    // Processar RENDAS
    items.rendas.forEach(renda => {
        if (renda.incluido === false) return;
        
        const valor = renda.valorEditado !== undefined ? renda.valorEditado : renda.valor;
        
        if (renda.recorrente) {
            const dataOriginal = new Date(renda.data + 'T00:00:00');
            const diaOriginal = dataOriginal.getDate();
            const diaAjustado = ajustarDiaAoMes(diaOriginal, ultimoDia);
            
            if (dias[diaAjustado - 1]) {
                dias[diaAjustado - 1].entradas.push({
                    descricao: renda.descricao,
                    valor: valor,
                    tipo: 'renda-recorrente'
                });
            }
        } else {
            const dataRenda = renda.dataEditada || renda.data;
            if (dataRenda && dataRenda.startsWith(monthKey)) {
                const dia = new Date(dataRenda + 'T00:00:00').getDate();
                if (dias[dia - 1]) {
                    dias[dia - 1].entradas.push({
                        descricao: renda.descricao,
                        valor: valor,
                        tipo: 'renda-avulsa'
                    });
                }
            }
        }
    });
    
    // Processar FIXOS
    items.fixos.forEach(fixo => {
        if (fixo.incluido === false) return;
        
        const valor = fixo.valorEditado !== undefined ? fixo.valorEditado : fixo.valor;
        const diaAjustado = ajustarDiaAoMes(fixo.diaVencimento, ultimoDia);
        
        if (dias[diaAjustado - 1]) {
            dias[diaAjustado - 1].saidas.push({
                descricao: fixo.descricao,
                valor: valor,
                tipo: 'fixo'
            });
        }
    });
    
    // Processar GASTOS
    items.gastos.forEach(gasto => {
        if (gasto.incluido === false) return;
        
        const valor = gasto.valorEditado !== undefined ? gasto.valorEditado : gasto.valor;
        const dataGasto = gasto.dataEditada || gasto.data;
        
        if (dataGasto && dataGasto.startsWith(monthKey)) {
            const dia = new Date(dataGasto + 'T00:00:00').getDate();
            if (dias[dia - 1]) {
                dias[dia - 1].saidas.push({
                    descricao: gasto.descricao,
                    valor: valor,
                    tipo: 'gasto'
                });
            }
        }
    });
    
    // Processar PARCELADOS
    items.parcelados.forEach(parc => {
        if (parc.incluido === false) return;
        
        const valorParcela = parc.valorEditado !== undefined ? parc.valorEditado : (parc.valorTotal / parc.parcelas);
        const dataInicio = new Date(parc.dataInicio + 'T00:00:00');
        const diaOriginal = dataInicio.getDate();
        const diaAjustado = ajustarDiaAoMes(diaOriginal, ultimoDia);
        
        if (dias[diaAjustado - 1]) {
            dias[diaAjustado - 1].saidas.push({
                descricao: `${parc.descricao} (${parc.numeroParcela}/${parc.parcelas})`,
                valor: valorParcela,
                tipo: 'parcelado'
            });
        }
    });
    
    // Processar METAS
    items.metas.forEach(meta => {
        if (meta.incluido === false) return;
        
        const valorMensal = meta.valorEditado !== undefined ? meta.valorEditado : meta.valorMensal;
        
        if (dias[ultimoDia - 1]) {
            dias[ultimoDia - 1].saidas.push({
                descricao: `Meta: ${meta.nome}`,
                valor: valorMensal,
                tipo: 'meta'
            });
        }
    });
    
    // Calcular saldos acumulados
    let saldoAcumulado = saldoInicial;
    
    dias.forEach(dia => {
        const totalEntradas = dia.entradas.reduce((sum, e) => sum + e.valor, 0);
        const totalSaidas = dia.saidas.reduce((sum, s) => sum + s.valor, 0);
        
        saldoAcumulado = saldoAcumulado + totalEntradas - totalSaidas;
        dia.saldo = saldoAcumulado;
        dia.totalEntradas = totalEntradas;
        dia.totalSaidas = totalSaidas;
    });
    
    return dias;
}


function savePlanningData() {
    if (!activePlanning) return;
    activePlanning.dadosJSON = JSON.stringify({ items: activePlanning.items });
    google.script.run.atualizarPlanejamento(activePlanning);
}

function formatMoney(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(date) {
    if (!date) return '';
    try {
        const d = new Date(date + 'T00:00:00');
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR');
    } catch (e) {
        return '';
    }
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showToast(title, message, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-icon">${icons[type] || 'ℹ️'}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ========== ATUALIZAÇÃO DE INTERFACE ==========
function updateBalance() {
    if (!activePlanning) {
        document.getElementById('balanceAmount').textContent = 'R$ 0,00';
        document.getElementById('totalIncome').textContent = 'R$ 0,00';
        document.getElementById('totalExpenses').textContent = 'R$ 0,00';
        return;
    }
    const projection = calculatePlanningProjection();
    if (!projection || projection.length === 0) {
        document.getElementById('balanceAmount').textContent = formatMoney(activePlanning.saldoInicial);
        document.getElementById('totalIncome').textContent = 'R$ 0,00';
        document.getElementById('totalExpenses').textContent = 'R$ 0,00';
        return;
    }
    const lastMonth = projection[projection.length - 1];
    const totalIncome = projection.reduce((s, m) => s + m.receitas, 0);
    const totalExpenses = projection.reduce((s, m) => s + m.despesas, 0);

    document.getElementById('balanceAmount').textContent = formatMoney(lastMonth.saldo);
    document.getElementById('totalIncome').textContent = formatMoney(totalIncome);
    document.getElementById('totalExpenses').textContent = formatMoney(totalExpenses);
    document.getElementById('balanceHero').classList.toggle('negative', lastMonth.saldo < 0);
}

function getUpcomingEvents() {
    if (!activePlanning) return [];
    
    const events = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // ✅ Data de 30 dias atrás para pegar eventos atrasados
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const months = getMonthsInPlan();
    
    months.forEach(month => {
        const items = getItemsForMonth(month.key);
        const [ano, mes] = month.key.split('-').map(Number);
        
        // FIXOS
        items.fixos.forEach(fixo => {
            if (fixo.incluido === false) return;
            
            const dia = fixo.diaVencimento;
            const eventDate = new Date(ano, mes - 1, Math.min(dia, new Date(ano, mes, 0).getDate()));
            
            // ✅ Incluir eventos desde 30 dias atrás
            if (eventDate >= thirtyDaysAgo) {
                events.push({
                    type: 'fixo',
                    date: eventDate,
                    dateStr: eventDate.toISOString().split('T')[0],
                    description: fixo.descricao,
                    value: fixo.valorEditado !== undefined ? fixo.valorEditado : fixo.valor,
                    category: fixo.categoria,
                    item: fixo,
                    monthKey: month.key,
                    overdue: eventDate < today
                });
            }
        });
        
        // GASTOS (não pagos)
        items.gastos.forEach(gasto => {
            if (gasto.incluido === false || gasto.pago) return;
            
            const dataGasto = gasto.dataEditada || gasto.data;
            if (!dataGasto) return;
            
            const eventDate = new Date(dataGasto + 'T00:00:00');
            
            // ✅ Incluir eventos desde 30 dias atrás
            if (eventDate >= thirtyDaysAgo) {
                events.push({
                    type: 'gasto',
                    date: eventDate,
                    dateStr: dataGasto,
                    description: gasto.descricao,
                    value: gasto.valorEditado !== undefined ? gasto.valorEditado : gasto.valor,
                    category: gasto.categoria,
                    item: gasto,
                    monthKey: month.key,
                    overdue: eventDate < today
                });
            }
        });
        
        // PARCELADOS
        items.parcelados.forEach(parc => {
            if (parc.incluido === false) return;
            
            const dataInicio = new Date(parc.dataInicio + 'T00:00:00');
            const dia = dataInicio.getDate();
            const eventDate = new Date(ano, mes - 1, Math.min(dia, new Date(ano, mes, 0).getDate()));
            
            // ✅ Incluir eventos desde 30 dias atrás
            if (eventDate >= thirtyDaysAgo) {
                const valorParcela = parc.valorEditado !== undefined ? parc.valorEditado : (parc.valorTotal / parc.parcelas);
                events.push({
                    type: 'parcelado',
                    date: eventDate,
                    dateStr: eventDate.toISOString().split('T')[0],
                    description: `${parc.descricao} (${parc.numeroParcela}/${parc.parcelas})`,
                    value: valorParcela,
                    item: parc,
                    monthKey: month.key,
                    overdue: eventDate < today
                });
            }
        });
        
        // ✅ RENDAS (que ainda não aconteceram ou estão atrasadas)
        items.rendas.forEach(renda => {
            if (renda.incluido === false) return;
            
            const dataRenda = renda.dataEditada || renda.data;
            if (!dataRenda) return;
            
            const eventDate = new Date(dataRenda + 'T00:00:00');
            
            if (eventDate >= thirtyDaysAgo) {
                events.push({
                    type: 'renda',
                    date: eventDate,
                    dateStr: dataRenda,
                    description: renda.descricao,
                    value: renda.valorEditado !== undefined ? renda.valorEditado : renda.valor,
                    item: renda,
                    monthKey: month.key,
                    overdue: eventDate < today,
                    isIncome: true
                });
            }
        });
        
        // ✅ METAS (último dia do mês)
        if (items.metas && items.metas.length > 0) {
            const ultimoDia = new Date(ano, mes, 0).getDate();
            const eventDate = new Date(ano, mes - 1, ultimoDia);
            
            if (eventDate >= thirtyDaysAgo) {
                items.metas.forEach(meta => {
                    if (meta.incluido === false) return;
                    
                    const valorMensal = meta.valorEditado !== undefined ? meta.valorEditado : meta.valorMensal;
                    events.push({
                        type: 'meta',
                        date: eventDate,
                        dateStr: eventDate.toISOString().split('T')[0],
                        description: `Meta: ${meta.nome}`,
                        value: valorMensal,
                        item: meta,
                        monthKey: month.key,
                        overdue: eventDate < today
                    });
                });
            }
        }
    });
    
    // ✅ Ordenar: atrasados primeiro, depois por data
    events.sort((a, b) => {
        if (a.overdue && !b.overdue) return -1;
        if (!a.overdue && b.overdue) return 1;
        return a.date - b.date;
    });
    
    return events;
}

function renderUpcomingEvents() {
    const container = document.getElementById('upcomingEventsList');
    const section = document.getElementById('upcomingEventsSection');
    
    if (!activePlanning) {
        section.style.display = 'none';
        return;
    }
    
    const events = getUpcomingEvents();
    
    if (events.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    container.innerHTML = events.map((event, idx) => {
        let cardClass = 'event-card';
        let dateLabel = '';
        
        // ✅ ATRASADO - prioridade máxima
        if (event.overdue) {
            cardClass += ' today'; // Usar estilo vermelho
            const diasAtraso = Math.floor((today - event.date) / (1000 * 60 * 60 * 24));
            dateLabel = `🔴 ATRASADO ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}`;
        } else if (event.date.getTime() === today.getTime()) {
            cardClass += ' today';
            dateLabel = '🔴 HOJE';
        } else if (event.date.getTime() === tomorrow.getTime()) {
            cardClass += ' tomorrow';
            dateLabel = '🟡 AMANHÃ';
        } else if (event.date <= nextWeek) {
            cardClass += ' soon';
            dateLabel = event.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
        } else {
            dateLabel = event.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        
        const typeIcons = {
            fixo: '📌',
            gasto: '💳',
            parcelado: '📅',
            renda: '💵',
            meta: '🎯'
        };
        
        const categoryBadge = event.category ? 
            `<span class="badge badge-${event.category.toLowerCase()}">${event.category}</span>` : '';
        
        // ✅ Valor em verde se for renda
        const valueClass = event.isIncome ? 'positive' : 'negative';
        
        return `
            <div class="${cardClass}">
                <div class="event-header">
                    <div class="event-info">
                        <div class="event-title">
                            ${typeIcons[event.type]} ${event.description}
                            ${categoryBadge}
                            ${event.overdue ? '<span class="badge" style="background:#fee2e2;color:#991b1b">⚠️ PENDENTE</span>' : ''}
                        </div>
                        <div class="event-date">
                            📅 ${dateLabel}
                        </div>
                    </div>
                    <div class="event-value ${valueClass}">${event.isIncome ? '+' : ''}${formatMoney(event.value)}</div>
                </div>
                <div class="event-actions">
    <button class="btn-postpone" onclick="postponeEvent(${idx})">⏭️ Empurrar</button>
    ${event.type === 'gasto' ? 
        `<button class="btn-mark-paid" onclick="markEventAsPaid(${idx})">✅ Pago</button>` : ''}
    ${event.type === 'renda' ? 
        `<button class="btn-mark-paid" onclick="confirmEventReceived(${idx})">✅ Recebido</button>` : ''}
    ${event.type === 'fixo' ? 
        `<button class="btn-mark-paid" onclick="markFixoAsPaid(${idx})">✅ Pago</button>` : ''}
    ${event.type === 'parcelado' ? 
        `<button class="btn-mark-paid" onclick="markParceladoAsPaid(${idx})">✅ Pago</button>` : ''}
    <button class="btn-delete-event" onclick="deleteEvent(${idx})">🗑️</button>
</div>
            </div>
        `;
    }).join('');
}

function postponeEvent(idx) {
    const events = getUpcomingEvents();
    const event = events[idx];
    
    if (!event) return;
    
    const novaDays = prompt('Empurrar por quantos dias?', '7');
    if (!novaDays) return;
    
    const dias = parseInt(novaDays);
    if (isNaN(dias) || dias <= 0) {
        showToast('Erro', 'Digite um número válido de dias', 'warning');
        return;
    }
    
    const novaData = new Date(event.date);
    novaData.setDate(novaData.getDate() + dias);
    const novaDataStr = novaData.toISOString().split('T')[0];
    
    const items = activePlanning.items[event.monthKey];
    
    if (event.type === 'fixo') {
        const itemArray = items.fixos;
        const itemIndex = itemArray.findIndex(i => i.id === event.item.id);
        if (itemIndex !== -1) {
            itemArray[itemIndex].diaVencimento = novaData.getDate();
        }
    } else if (event.type === 'gasto') {
        const itemArray = items.gastos;
        const itemIndex = itemArray.findIndex(i => i.id === event.item.id);
        if (itemIndex !== -1) {
            itemArray[itemIndex].dataEditada = novaDataStr;
        }
    } else if (event.type === 'parcelado') {
        const itemArray = items.parcelados;
        const itemIndex = itemArray.findIndex(i => i.id === event.item.id && i.numeroParcela === event.item.numeroParcela);
        if (itemIndex !== -1) {
            itemArray[itemIndex].dataEditada = novaDataStr;
        }
    }
    
    savePlanningData();
    updateAll();
    showToast('Sucesso!', `Evento adiado para ${novaData.toLocaleDateString('pt-BR')}`, 'success');
}

function markEventAsPaid(idx) {
    const events = getUpcomingEvents();
    const event = events[idx];
    
    if (!event || event.type !== 'gasto') return;
    
    const items = activePlanning.items[event.monthKey];
    const itemArray = items.gastos;
    const itemIndex = itemArray.findIndex(i => i.id === event.item.id);
    
    if (itemIndex !== -1) {
        itemArray[itemIndex].pago = true;
        
        // Atualizar também no appData global se for um item global
        if (event.item.fromGlobal) {
            const globalItem = appData.gastos.find(g => g.id === event.item.id);
            if (globalItem) {
                globalItem.pago = true;
                callBackend('atualizar', 'gastos', globalItem);
            }
        }
        
        savePlanningData();
        updateAll();
        showToast('Sucesso!', 'Gasto marcado como pago', 'success');
    }
}

function deleteEvent(idx) {
    const events = getUpcomingEvents();
    const event = events[idx];
    
    if (!event) return;
    
    if (!confirm(`Excluir "${event.description}"?`)) return;
    
    const items = activePlanning.items[event.monthKey];
    let itemArray;
    
    if (event.type === 'fixo') {
        itemArray = items.fixos;
    } else if (event.type === 'gasto') {
        itemArray = items.gastos;
    } else if (event.type === 'parcelado') {
        itemArray = items.parcelados;
    }
    
    const itemIndex = itemArray.findIndex(i => i.id === event.item.id);
    
    if (itemIndex !== -1) {
        itemArray[itemIndex].incluido = false;
        savePlanningData();
        updateAll();
        showToast('Sucesso!', 'Evento removido', 'success');
    }
}

function confirmEventReceived(idx) {
    const events = getUpcomingEvents();
    const event = events[idx];
    
    if (!event || event.type !== 'renda') return;
    
    const items = activePlanning.items[event.monthKey];
    const itemArray = items.rendas;
    const itemIndex = itemArray.findIndex(i => i.id === event.item.id);
    
    if (itemIndex !== -1) {
        // Marcar como recebida removendo do planejamento
        itemArray[itemIndex].incluido = false;
        
        savePlanningData();
        updateAll();
        showToast('Sucesso!', 'Renda confirmada como recebida', 'success');
    }
}

function markFixoAsPaid(idx) {
    const events = getUpcomingEvents();
    const event = events[idx];
    
    if (!event || event.type !== 'fixo') return;
    
    if (!confirm(`Marcar "${event.description}" como pago neste mês?`)) return;
    
    const items = activePlanning.items[event.monthKey];
    const itemArray = items.fixos;
    const itemIndex = itemArray.findIndex(i => i.id === event.item.id);
    
    if (itemIndex !== -1) {
        // Marcar como excluído apenas deste mês
        itemArray[itemIndex].incluido = false;
        
        savePlanningData();
        updateAll();
        showToast('Sucesso!', 'Custo fixo marcado como pago', 'success');
    }
}

function markParceladoAsPaid(idx) {
    const events = getUpcomingEvents();
    const event = events[idx];
    
    if (!event || event.type !== 'parcelado') return;
    
    if (!confirm(`Marcar parcela ${event.item.numeroParcela}/${event.item.parcelas} como paga?`)) return;
    
    const items = activePlanning.items[event.monthKey];
    const itemArray = items.parcelados;
    const itemIndex = itemArray.findIndex(i => 
        i.id === event.item.id && i.numeroParcela === event.item.numeroParcela
    );
    
    if (itemIndex !== -1) {
        // Marcar como excluído apenas esta parcela
        itemArray[itemIndex].incluido = false;
        
        // Atualizar também o global se for fromGlobal
        if (event.item.fromGlobal) {
            const globalItem = appData.parcelados.find(p => p.id === event.item.id);
            if (globalItem) {
                globalItem.parcelasPagas = (globalItem.parcelasPagas || 0) + 1;
                callBackend('atualizar', 'parcelados', globalItem);
            }
        }
        
        savePlanningData();
        updateAll();
        showToast('Sucesso!', `Parcela ${event.item.numeroParcela}/${event.item.parcelas} marcada como paga`, 'success');
    }
}

function updatePlanning() {
    const container = document.getElementById('planningActiveSection');
    if (!activePlanning) {
        container.innerHTML = '<div class="alert alert-info"><span>📋</span><span>Crie um planejamento para começar</span></div>';
        renderUpcomingEvents();
        renderPlanningList();
        return;
    }

    const projection = calculatePlanningProjection();
    let timelineHTML = '';
    if (projection && projection.length > 0) {
        timelineHTML = `<div class="timeline-container">
        <div class="timeline-header">📅 Projeção (clique para editar)</div>
        <div class="timeline-months">${projection.map(m => `
            <div class="timeline-month ${m.saldo < 0 ? 'negative' : 'positive'} ${selectedMonth === m.key ? 'selected' : ''}" onclick="selectMonth('${m.key}')">
                <div class="timeline-month-name">${m.name}</div>
                <div class="timeline-month-saldo">${formatMoney(m.saldo)}</div>
                <div class="timeline-month-details">Receitas: ${formatMoney(m.receitas)}<br>Despesas: ${formatMoney(m.despesas)}</div>
            </div>`).join('')}
        </div></div>`;
    }

    const periodoTexto = `${formatDate(activePlanning.dataInicio)} até ${formatDate(activePlanning.dataFim)}`;
    container.innerHTML = `<div class="plan-card">
    <div class="plan-header"><div class="plan-name">${activePlanning.nome}</div><div class="plan-status">ATIVO</div></div>
    <div class="plan-info">
        <div class="plan-info-item"><div class="plan-info-label">Saldo Inicial</div><div class="plan-info-value">${formatMoney(activePlanning.saldoInicial)}</div></div>
        <div class="plan-info-item"><div class="plan-info-label">Período</div><div class="plan-info-value">${periodoTexto}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-warning" onclick="finalizarPlanejamento()">✓ Finalizar</button>
        <button class="btn btn-sm btn-danger" onclick="desativarPlanejamento()">⏸️ Desativar</button>
    </div>
    </div>${timelineHTML}`;
    renderPlanningList();
}

function renderPlanningList() {
    const container = document.getElementById('planningList');
    const plans = appData.planejamentos || [];
    if (!plans.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum planejamento</div></div>';
        return;
    }
    container.innerHTML = plans.map(p => {
        const isActive = p.ativo;
        const periodoTexto = `${formatDate(p.dataInicio)} até ${formatDate(p.dataFim)}`;
        return `<div class="plan-card ${isActive ? '' : 'inactive'}">
        <div class="plan-header"><div class="plan-name">${p.nome}</div><div class="plan-status">${isActive ? 'ATIVO' : 'INATIVO'}</div></div>
        <div class="plan-info">
            <div class="plan-info-item"><div class="plan-info-label">Saldo Inicial</div><div class="plan-info-value">${formatMoney(p.saldoInicial)}</div></div>
            <div class="plan-info-item"><div class="plan-info-label">Período</div><div class="plan-info-value">${periodoTexto}</div></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            ${!isActive ? `<button class="btn btn-sm btn-success" onclick="ativarPlanejamento('${p.id}')">▶️ Ativar</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="deletePlanning('${p.id}')">🗑️</button>
        </div>
    </div>`;
    }).join('');
}

// ========== RENDERIZAÇÃO DE LISTAS ==========
function renderExpenses() {
    const container = document.getElementById('expensesList');
    const expenses = appData.gastos || [];
    if (!expenses.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-title">Nenhum gasto cadastrado</div></div>';
return;
}
const sorted = expenses.sort((a, b) => new Date(b.data) - new Date(a.data));
container.innerHTML = sorted.map(e =>     `<div class="card-item">         <div class="card-header">             <div class="card-main">                 <div class="card-title">${e.descricao}<span class="badge badge-${e.categoria ? e.categoria.toLowerCase() : 'outros'}">${e.categoria}</span></div>                 <div class="card-subtitle">${formatDate(e.data)}<span class="badge badge-${e.pago ? 'pago' : 'pendente'}">${e.pago ? 'Pago' : 'Pendente'}</span></div>             </div>             <div class="card-amount negative">${formatMoney(e.valor)}</div>         </div>         ${e.observacoes ?`<div style="font-size:11px;color:var(--text-secondary);margin-top:6px">${e.observacoes}</div>` : ''}         <div class="card-actions">
    <button class="btn btn-sm" onclick="togglePaid('${e.id}',${!e.pago})">${e.pago ? '↩️' : '✅'} ${e.pago ? 'Desfazer' : 'Pago'}</button>
    <button class="btn btn-sm btn-warning" onclick="editGlobalItem('gastos','${e.id}')">✏️ Editar</button>
    <button class="btn btn-sm btn-danger" onclick="deleteExpense('${e.id}')">🗑️</button>
</div>     </div>`).join('');
}
function renderIncome() {
const container = document.getElementById('incomeList');
const income = appData.rendas || [];
if (!income.length) {
container.innerHTML = '<div class="empty-state"><div class="empty-icon">💵</div><div class="empty-title">Nenhuma renda cadastrada</div></div>';
return;
}
container.innerHTML = income.map(r =>      `<div class="card-item">         <div class="card-header">             <div class="card-main">                 <div class="card-title">${r.descricao}${r.recorrente ? '<span class="badge badge-plan">Recorrente</span>' : ''}</div>                 <div class="card-subtitle">${formatDate(r.data)}</div>             </div>             <div class="card-amount positive">${formatMoney(r.valor)}</div>         </div>         <div class="card-actions">
    <button class="btn btn-sm btn-warning" onclick="editGlobalItem('rendas','${r.id}')">✏️ Editar</button>
    <button class="btn btn-sm btn-danger" onclick="deleteIncome('${r.id}')">🗑️</button>
</div>     </div>`).join('');
}
function renderRecurring() {
const container = document.getElementById('recurringList');
const recurring = appData.fixos || [];
if (!recurring.length) {
container.innerHTML = '<div class="empty-state"><div class="empty-icon">📌</div><div class="empty-title">Nenhum custo fixo</div></div>';
return;
}
container.innerHTML = recurring.map(f =>      `<div class="card-item">         <div class="card-header">             <div class="card-main">                 <div class="card-title">${f.descricao}<span class="badge badge-${f.categoria ? f.categoria.toLowerCase() : 'outros'}">${f.categoria}</span></div>                 <div class="card-subtitle">Dia ${f.diaVencimento}<span class="badge badge-${f.ativo ? 'ativa' : 'inativa'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></div>             </div>             <div class="card-amount negative">${formatMoney(f.valor)}</div>         </div>         <div class="card-actions">
    <button class="btn btn-sm btn-${f.ativo ? 'warning' : 'success'}" onclick="toggleRecurring('${f.id}',${!f.ativo})">${f.ativo ? '⏸️' : '▶️'} ${f.ativo ? 'Pausar' : 'Ativar'}</button>
    <button class="btn btn-sm" onclick="editGlobalItem('fixos','${f.id}')">✏️ Editar</button>
    <button class="btn btn-sm btn-danger" onclick="deleteRecurring('${f.id}')">🗑️</button>
</div>     </div>`).join('');
}
function renderGoals() {
const container = document.getElementById('goalsList');
const goals = appData.metas || [];
if (!goals.length) {
container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">Nenhuma meta cadastrada</div></div>';
return;
}
container.innerHTML = goals.map(g => {
const progress = g.valorTotal > 0 ? (g.valorAtual / g.valorTotal * 100) : 0;
return     `<div class="card-item">         <div class="card-header">             <div class="card-main">                 <div class="card-title">${g.nome}${g.dataObjetivo ?`<span style="font-size:10px;opacity:0.7">até ${formatDate(g.dataObjetivo)}</span> `: ''}</div>                 <div class="card-subtitle">${formatMoney(g.valorAtual)} de ${formatMoney(g.valorTotal)}</div>             </div>         </div>         <div class="progress-container">             <div class="progress-header"><div class="progress-label">Progresso</div><div class="progress-value">${progress.toFixed(1)}%</div></div>             <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(progress, 100)}%"></div></div>         </div>         <div class="card-actions">
    <button class="btn btn-sm" onclick="updateGoalProgress('${g.id}')">💰 Atualizar</button>
    <button class="btn btn-sm btn-warning" onclick="editGlobalItem('metas','${g.id}')">✏️ Editar</button>
    <button class="btn btn-sm btn-danger" onclick="deleteGoal('${g.id}')">🗑️</button>
</div>     </div>`;
}).join('');
}
function renderInstallments() {
const container = document.getElementById('installmentsList');
const installments = appData.parcelados || [];
if (!installments.length) {
container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Nenhum parcelamento</div></div>';
return;
}
container.innerHTML = installments.map(p => {
const monthly = p.valorTotal / p.parcelas;
const paid = p.parcelasPagas || 0;
const remaining = p.parcelas - paid;
const progress = paid / p.parcelas * 100;
return      `<div class="card-item">         <div class="card-header">             <div class="card-main">                 <div class="card-title">${p.descricao}</div>                 <div class="card-subtitle">${paid}/${p.parcelas} • ${formatMoney(monthly)}/mês</div>             </div>             <div class="card-amount">${formatMoney(p.valorTotal)}</div>         </div>         <div class="progress-container">             <div class="progress-header"><div class="progress-label">Pagas</div><div class="progress-value">${progress.toFixed(0)}%</div></div>             <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>         </div>         <div class="card-actions">             <button class="btn btn-sm" onclick="payInstallment('${p.id}')" ${remaining <= 0 ? 'disabled' : ''}>✅ Pagar</button>             <button class="btn btn-sm btn-danger" onclick="deleteInstallment('${p.id}')">🗑️</button>         </div>     </div>`;
}).join('');
}
// ========== FUNÇÕES AUXILIARES PARA MODAL ==========
function buildFormForType(type) {
    const forms = {
        fixos: `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="newItemDesc" placeholder="Ex: Aluguel" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor</label>
                    <input type="number" class="form-input" id="newItemValue" placeholder="0,00" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Dia Venc.</label>
                    <input type="number" class="form-input" id="newItemDay" min="1" max="31" placeholder="5" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📂 Categoria</label>
                <select class="form-select" id="newItemCategory" required>
                    ${appData.categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
        `,
        
        rendas: `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="newItemDesc" placeholder="Ex: Salário" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor</label>
                    <input type="number" class="form-input" id="newItemValue" placeholder="0,00" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Data</label>
                    <input type="date" class="form-input" id="newItemDate" required>
                </div>
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="newItemRecurring">
                <label class="checkbox-label" for="newItemRecurring">🔄 Renda recorrente (todo mês)</label>
            </div>
        `,
        
        parcelados: `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="newItemDesc" placeholder="Ex: Geladeira" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor Total</label>
                    <input type="number" class="form-input" id="newItemTotal" placeholder="0,00" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📊 Parcelas</label>
                    <input type="number" class="form-input" id="newItemParcelas" min="2" max="60" placeholder="12" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📅 Data 1ª Parcela</label>
                <input type="date" class="form-input" id="newItemDate" required>
            </div>
        `,
        
        gastos: `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="newItemDesc" placeholder="Ex: Mercado" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor</label>
                    <input type="number" class="form-input" id="newItemValue" placeholder="0,00" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Data</label>
                    <input type="date" class="form-input" id="newItemDate" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📂 Categoria</label>
                <select class="form-select" id="newItemCategory" required>
                    ${appData.categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="newItemPaid">
                <label class="checkbox-label" for="newItemPaid">✅ Já pago</label>
            </div>
        `,
        
        metas: `
            <div class="form-group">
                <label class="form-label">📝 Nome da Meta</label>
                <input type="text" class="form-input" id="newItemDesc" placeholder="Ex: Viagem para Europa" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor Total</label>
                    <input type="number" class="form-input" id="newItemTotal" placeholder="0,00" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">💵 Guardar por Mês</label>
                    <input type="number" class="form-input" id="newItemMonthly" placeholder="0,00" step="0.01" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📅 Data Objetivo (opcional)</label>
                <input type="date" class="form-input" id="newItemDate">
            </div>
        `
    };
    
    return forms[type] || '';
}

function getTypeLabel(type) {
    const labels = {
        fixos: 'Custo Fixo',
        rendas: 'Renda',
        parcelados: 'Parcelamento',
        gastos: 'Gasto',
        metas: 'Meta'
    };
    return labels[type] || type;
}

function getTypeIcon(type) {
    const icons = { fixos: '📌', rendas: '💵', parcelados: '📅', gastos: '💳', metas: '🎯' };
    return icons[type] || '📋';
}

function showAddItemModal() {
    const formHTML = buildFormForType(currentItemType);
    
    document.getElementById('addItemFormContent').innerHTML = formHTML;
    
    const icon = getTypeIcon(currentItemType);
    document.getElementById('addItemModalTitle').textContent = `➕ Adicionar ${getTypeLabel(currentItemType)}`;
    
    setTimeout(() => {
        const dateField = document.getElementById('newItemDate');
        if (dateField) {
            dateField.value = new Date().toISOString().split('T')[0];
        }
    }, 100);
    
    document.getElementById('addToFuture').checked = true;
    document.getElementById('addItemModal').classList.add('active');
}

// ========== FORMULÁRIOS COM SINCRONIZAÇÃO ==========

document.getElementById('formExpense').addEventListener('submit', e => {
    e.preventDefault();
    const gasto = {
        id: generateId(),
        descricao: document.getElementById('expenseDesc').value,
        valor: parseFloat(document.getElementById('expenseValue').value),
        data: document.getElementById('expenseDate').value,
        categoria: document.getElementById('expenseCategory').value,
        observacoes: document.getElementById('expenseNotes').value,
        pago: document.getElementById('expensePaid').checked,
        idPlanejamento: '' // ✅ Sempre enviar vazio para itens globais
    };
    
    appData.gastos.push(gasto);
    syncItemToPlan(gasto, 'gastos', 'add');
    
    // ✅ Adicionar tratamento de erro
    callBackend('adicionar', 'gastos', gasto)
        .then(() => {
            updateAll();
            e.target.reset();
            setTodayDates();
            showToast('Sucesso!', 'Gasto adicionado', 'success');
        })
        .catch(err => {
            console.error('Erro ao salvar gasto:', err);
            // Remover do array se falhou
            appData.gastos = appData.gastos.filter(g => g.id !== gasto.id);
            updateAll();
        });
});

function togglePaid(id, newStatus) {
    const item = appData.gastos.find(g => g.id === id);
    if (item) {
        item.pago = newStatus;
        syncItemToPlan(item, 'gastos', 'update');
        callBackend('atualizar', 'gastos', item);
        updateAll();
        showToast('Sucesso!', newStatus ? 'Marcado como pago' : 'Desmarcado', 'success');
    }
}

function deleteExpense(id) {
    if (confirm('Excluir este gasto?')) {
        const item = appData.gastos.find(g => g.id === id);
        appData.gastos = appData.gastos.filter(g => g.id !== id);
        
        if (item) syncItemToPlan(item, 'gastos', 'delete');
        callBackend('excluir', 'gastos', id);
        
        updateAll();
        showToast('Sucesso!', 'Gasto excluído', 'success');
    }
}

// RENDAS
document.getElementById('formIncome').addEventListener('submit', e => {
    e.preventDefault();
    const renda = {
        id: generateId(),
        descricao: document.getElementById('incomeDesc').value,
        valor: parseFloat(document.getElementById('incomeValue').value),
        data: document.getElementById('incomeDate').value,
        recorrente: document.getElementById('incomeRecurring').checked,
        idPlanejamento: '' // ✅ Sempre enviar vazio para itens globais
    };
    
    appData.rendas.push(renda);
    syncItemToPlan(renda, 'rendas', 'add');
    
    // ✅ Adicionar tratamento de erro
    callBackend('adicionar', 'rendas', renda)
        .then(() => {
            updateAll();
            e.target.reset();
            setTodayDates();
            showToast('Sucesso!', 'Renda adicionada', 'success');
        })
        .catch(err => {
            console.error('Erro ao salvar renda:', err);
            // Remover do array se falhou
            appData.rendas = appData.rendas.filter(r => r.id !== renda.id);
            updateAll();
        });
});

function deleteIncome(id) {
    if (confirm('Excluir esta renda?')) {
        const item = appData.rendas.find(r => r.id === id);
        appData.rendas = appData.rendas.filter(r => r.id !== id);
        
        if (item) syncItemToPlan(item, 'rendas', 'delete');
        callBackend('excluir', 'rendas', id);
        
        updateAll();
        showToast('Sucesso!', 'Renda excluída', 'success');
    }
}

document.getElementById('formRecurring').addEventListener('submit', e => {
    e.preventDefault();
    const fixo = {
        id: generateId(),
        descricao: document.getElementById('recurringDesc').value,
        valor: parseFloat(document.getElementById('recurringValue').value),
        diaVencimento: parseInt(document.getElementById('recurringDay').value),
        categoria: document.getElementById('recurringCategory').value,
        ativo: true,
        idPlanejamento: '' // ✅ Sempre enviar vazio para itens globais
    };
    
    appData.fixos.push(fixo);
    syncItemToPlan(fixo, 'fixos', 'add');
    
    // ✅ Adicionar tratamento de erro
    callBackend('adicionar', 'fixos', fixo)
        .then(() => {
            updateAll();
            e.target.reset();
            showToast('Sucesso!', 'Custo fixo cadastrado', 'success');
        })
        .catch(err => {
            console.error('Erro ao salvar custo fixo:', err);
            // Remover do array se falhou
            appData.fixos = appData.fixos.filter(f => f.id !== fixo.id);
            updateAll();
        });
});

function toggleRecurring(id, newStatus) {
    const item = appData.fixos.find(f => f.id === id);
    if (item) {
        item.ativo = newStatus;
        syncItemToPlan(item, 'fixos', 'update');
        callBackend('atualizar', 'fixos', item);
        updateAll();
        showToast('Sucesso!', newStatus ? 'Custo ativado' : 'Custo pausado', 'success');
    }
}

function deleteRecurring(id) {
    if (confirm('Excluir este custo fixo?')) {
        const item = appData.fixos.find(f => f.id === id);
        appData.fixos = appData.fixos.filter(f => f.id !== id);
        
        if (item) syncItemToPlan(item, 'fixos', 'delete');
        callBackend('excluir', 'fixos', id);
        
        updateAll();
        showToast('Sucesso!', 'Custo fixo excluído', 'success');
    }
}

// METAS
document.getElementById('formGoal').addEventListener('submit', e => {
    e.preventDefault();
    const meta = {
        id: generateId(),
        nome: document.getElementById('goalName').value,
        valorTotal: parseFloat(document.getElementById('goalTotal').value),
        valorAtual: parseFloat(document.getElementById('goalCurrent').value),
        dataObjetivo: document.getElementById('goalDate').value || null,
        ativa: true,
        idPlanejamento: '' // ✅ Sempre enviar vazio para itens globais
    };
    
    appData.metas.push(meta);
    syncItemToPlan(meta, 'metas', 'add');
    
    // ✅ Adicionar tratamento de erro
    callBackend('adicionar', 'metas', meta)
        .then(() => {
            updateAll();
            e.target.reset();
            setTodayDates();
            showToast('Sucesso!', 'Meta criada', 'success');
        })
        .catch(err => {
            console.error('Erro ao salvar meta:', err);
            // Remover do array se falhou
            appData.metas = appData.metas.filter(m => m.id !== meta.id);
            updateAll();
        });
});

function updateGoalProgress(id) {
    const meta = appData.metas.find(m => m.id === id);
    if (!meta) return;
    const novoValor = prompt(`Atualizar progresso de "${meta.nome}"\n\nValor atual: ${formatMoney(meta.valorAtual)}\nDigite o novo valor:`, meta.valorAtual);
    if (novoValor !== null) {
        meta.valorAtual = parseFloat(novoValor) || 0;
        syncItemToPlan(meta, 'metas', 'update');
        callBackend('atualizar', 'metas', meta);
        updateAll();
        showToast('Sucesso!', 'Progresso atualizado', 'success');
    }
}

function deleteGoal(id) {
    if (confirm('Excluir esta meta?')) {
        const item = appData.metas.find(m => m.id === id);
        appData.metas = appData.metas.filter(m => m.id !== id);
        
        if (item) syncItemToPlan(item, 'metas', 'delete');
        callBackend('excluir', 'metas', id);
        
        updateAll();
        showToast('Sucesso!', 'Meta excluída', 'success');
    }
}

let editingGlobalItem = null;

function editGlobalItem(type, id) {
    const item = appData[type].find(i => i.id === id);
    if (!item) {
        showToast('Erro', 'Item não encontrado', 'error');
        return;
    }
    
    editingGlobalItem = { type: type, item: item };
    
    const typeLabels = {
        gastos: 'Gasto',
        rendas: 'Renda',
        fixos: 'Custo Fixo',
        metas: 'Meta',
        parcelados: 'Parcelamento'
    };
    
    document.getElementById('editGlobalTitle').textContent = `✏️ Editar ${typeLabels[type]}`;
    
    let formHTML = '';
    
    if (type === 'gastos') {
        formHTML = `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="editGlobalDesc" value="${item.descricao}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor</label>
                    <input type="number" class="form-input" id="editGlobalValue" value="${item.valor}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Data</label>
                    <input type="date" class="form-input" id="editGlobalDate" value="${item.data}" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📂 Categoria</label>
                <select class="form-select" id="editGlobalCategory" required>
                    ${appData.categorias.map(c => `<option value="${c}" ${c === item.categoria ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">📋 Observações</label>
                <textarea class="form-textarea" id="editGlobalNotes">${item.observacoes || ''}</textarea>
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="editGlobalPaid" ${item.pago ? 'checked' : ''}>
                <label class="checkbox-label" for="editGlobalPaid">✅ Já pago</label>
            </div>
        `;
    } else if (type === 'rendas') {
        formHTML = `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="editGlobalDesc" value="${item.descricao}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor</label>
                    <input type="number" class="form-input" id="editGlobalValue" value="${item.valor}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Data</label>
                    <input type="date" class="form-input" id="editGlobalDate" value="${item.data}" required>
                </div>
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="editGlobalRecurring" ${item.recorrente ? 'checked' : ''}>
                <label class="checkbox-label" for="editGlobalRecurring">🔄 Renda recorrente</label>
            </div>
        `;
    } else if (type === 'fixos') {
        formHTML = `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="editGlobalDesc" value="${item.descricao}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor</label>
                    <input type="number" class="form-input" id="editGlobalValue" value="${item.valor}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Dia Vencimento</label>
                    <input type="number" class="form-input" id="editGlobalDay" value="${item.diaVencimento}" min="1" max="31" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📂 Categoria</label>
                <select class="form-select" id="editGlobalCategory" required>
                    ${appData.categorias.map(c => `<option value="${c}" ${c === item.categoria ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="editGlobalActive" ${item.ativo ? 'checked' : ''}>
                <label class="checkbox-label" for="editGlobalActive">✅ Ativo</label>
            </div>
        `;
    } else if (type === 'metas') {
        formHTML = `
            <div class="form-group">
                <label class="form-label">📝 Nome</label>
                <input type="text" class="form-input" id="editGlobalName" value="${item.nome}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor Total</label>
                    <input type="number" class="form-input" id="editGlobalTotal" value="${item.valorTotal}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">💵 Valor Atual</label>
                    <input type="number" class="form-input" id="editGlobalCurrent" value="${item.valorAtual}" step="0.01" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">📅 Data Objetivo</label>
                <input type="date" class="form-input" id="editGlobalDate" value="${item.dataObjetivo || ''}">
            </div>
            <div class="checkbox-wrapper">
                <input type="checkbox" class="checkbox-input" id="editGlobalActive" ${item.ativa !== false ? 'checked' : ''}>
                <label class="checkbox-label" for="editGlobalActive">✅ Ativa</label>
            </div>
        `;
    } else if (type === 'parcelados') {
        formHTML = `
            <div class="form-group">
                <label class="form-label">📝 Descrição</label>
                <input type="text" class="form-input" id="editGlobalDesc" value="${item.descricao}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">💰 Valor Total</label>
                    <input type="number" class="form-input" id="editGlobalTotal" value="${item.valorTotal}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📊 Total de Parcelas</label>
                    <input type="number" class="form-input" id="editGlobalParcelas" value="${item.parcelas}" min="2" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">✅ Parcelas Pagas</label>
                    <input type="number" class="form-input" id="editGlobalPaid" value="${item.parcelasPagas}" min="0" max="${item.parcelas}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">📅 Data Início</label>
                    <input type="date" class="form-input" id="editGlobalDate" value="${item.dataInicio}" required>
                </div>
            </div>
        `;
    }
    
    document.getElementById('editGlobalContent').innerHTML = formHTML;
    
    // Mostrar checkbox apenas para itens que podem afetar planejamento
    const showCheckbox = activePlanning && (type === 'rendas' || type === 'fixos' || type === 'metas');
    document.getElementById('editGlobalCheckboxContainer').style.display = showCheckbox ? 'flex' : 'none';
    
    document.getElementById('editGlobalModal').classList.add('active');
}

document.getElementById('formEditGlobal').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!editingGlobalItem) return;
    
    const { type, item } = editingGlobalItem;
    const applyToFuture = document.getElementById('applyToFuturePlanning')?.checked || false;
    
    // Atualizar dados do item conforme o tipo
    if (type === 'gastos') {
        item.descricao = document.getElementById('editGlobalDesc').value;
        item.valor = parseFloat(document.getElementById('editGlobalValue').value);
        item.data = document.getElementById('editGlobalDate').value;
        item.categoria = document.getElementById('editGlobalCategory').value;
        item.observacoes = document.getElementById('editGlobalNotes').value;
        item.pago = document.getElementById('editGlobalPaid').checked;
        
    } else if (type === 'rendas') {
        item.descricao = document.getElementById('editGlobalDesc').value;
        item.valor = parseFloat(document.getElementById('editGlobalValue').value);
        item.data = document.getElementById('editGlobalDate').value;
        item.recorrente = document.getElementById('editGlobalRecurring').checked;
        
    } else if (type === 'fixos') {
        item.descricao = document.getElementById('editGlobalDesc').value;
        item.valor = parseFloat(document.getElementById('editGlobalValue').value);
        item.diaVencimento = parseInt(document.getElementById('editGlobalDay').value);
        item.categoria = document.getElementById('editGlobalCategory').value;
        item.ativo = document.getElementById('editGlobalActive').checked;
        
    } else if (type === 'metas') {
        item.nome = document.getElementById('editGlobalName').value;
        item.valorTotal = parseFloat(document.getElementById('editGlobalTotal').value);
        item.valorAtual = parseFloat(document.getElementById('editGlobalCurrent').value);
        item.dataObjetivo = document.getElementById('editGlobalDate').value || null;
        item.ativa = document.getElementById('editGlobalActive').checked;
        
    } else if (type === 'parcelados') {
        item.descricao = document.getElementById('editGlobalDesc').value;
        item.valorTotal = parseFloat(document.getElementById('editGlobalTotal').value);
        item.parcelas = parseInt(document.getElementById('editGlobalParcelas').value);
        item.parcelasPagas = parseInt(document.getElementById('editGlobalPaid').value);
        item.dataInicio = document.getElementById('editGlobalDate').value;
    }
    
    // Salvar no backend
    callBackend('atualizar', type, item)
        .then(() => {
            // Atualizar no planejamento se necessário
            if (activePlanning && type !== 'parcelados') {
                updateItemInPlanning(item, type, applyToFuture);
            } else if (type === 'parcelados') {
                // Parcelados sempre atualizam todos os meses
                updateItemInPlanning(item, type, true);
            }
            
            updateAll();
            closeModal('editGlobalModal');
            showToast('Sucesso!', 'Item atualizado', 'success');
            editingGlobalItem = null;
        })
        .catch(err => {
            console.error('Erro ao atualizar item:', err);
        });
});

function updateItemInPlanning(item, type, applyToFuture) {
    if (!activePlanning || !activePlanning.items) return;
    
    const months = getMonthsInPlan();
    const start = new Date(activePlanning.dataInicio);
    const end = new Date(activePlanning.dataFim);
    
    if (type === 'fixos') {
        months.forEach(month => {
            const items = activePlanning.items[month.key][type];
            const planItem = items.find(i => i.id === item.id && i.fromGlobal);
            
            if (planItem && planItem.valorEditado === undefined && planItem.incluido !== false) {
                // Atualizar preservando customizações
                planItem.descricao = item.descricao;
                planItem.categoria = item.categoria;
                planItem.ativo = item.ativo;
                planItem.diaVencimento = item.diaVencimento;
                planItem.valor = item.valor;
            }
        });
        
    } else if (type === 'rendas') {
        if (item.recorrente) {
            months.forEach(month => {
                const items = activePlanning.items[month.key][type];
                const planItem = items.find(i => i.id === item.id && i.fromGlobal);
                
                if (planItem && planItem.valorEditado === undefined && planItem.incluido !== false) {
                    planItem.descricao = item.descricao;
                    planItem.valor = item.valor;
                    planItem.data = item.data;
                    planItem.recorrente = item.recorrente;
                }
            });
        } else {
            // Renda avulsa - atualizar apenas no mês correspondente
            const itemDate = new Date(item.data + 'T00:00:00');
            if (itemDate >= start && itemDate <= end) {
                const monthKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;
                
                if (activePlanning.items[monthKey]) {
                    const items = activePlanning.items[monthKey][type];
                    const planItem = items.find(i => i.id === item.id && i.fromGlobal);
                    
                    if (planItem && planItem.valorEditado === undefined && planItem.incluido !== false) {
                        planItem.descricao = item.descricao;
                        planItem.valor = item.valor;
                        planItem.data = item.data;
                        planItem.recorrente = item.recorrente;
                    }
                }
            }
        }
        
    } else if (type === 'metas') {
        const monthlyValue = item.valorTotal / months.length;
        
        months.forEach(month => {
            const items = activePlanning.items[month.key][type];
            const planItem = items.find(i => i.id === item.id && i.fromGlobal);
            
            if (planItem && planItem.valorEditado === undefined && planItem.incluido !== false) {
                planItem.nome = item.nome;
                planItem.valorTotal = item.valorTotal;
                planItem.valorAtual = item.valorAtual;
                planItem.dataObjetivo = item.dataObjetivo;
                planItem.ativa = item.ativa;
                planItem.valorMensal = monthlyValue;
            }
        });
        
    } else if (type === 'parcelados') {
        // Remover todas as parcelas antigas deste item
        months.forEach(month => {
            const items = activePlanning.items[month.key][type];
            const oldItems = items.filter(i => i.id === item.id && i.fromGlobal);
            oldItems.forEach(old => {
                const idx = items.indexOf(old);
                if (idx !== -1) items.splice(idx, 1);
            });
        });
        
        // Adicionar novamente com os novos dados
        const startDate = new Date(item.dataInicio + 'T00:00:00');
        let currentDate = new Date(startDate);
        
        for (let i = 0; i < item.parcelas; i++) {
            if (currentDate >= start && currentDate <= end) {
                const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                
                if (activePlanning.items[monthKey]) {
                    activePlanning.items[monthKey][type].push({
                        ...item,
                        numeroParcela: i + 1,
                        incluido: true,
                        fromGlobal: true
                    });
                }
            }
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }
    
    savePlanningData();
}

document.getElementById('formInstallment').addEventListener('submit', e => {
    e.preventDefault();
    const parcela = {
        id: generateId(),
        descricao: document.getElementById('installmentDesc').value,
        valorTotal: parseFloat(document.getElementById('installmentTotal').value),
        parcelas: parseInt(document.getElementById('installmentCount').value),
        parcelasPagas: 0,
        dataInicio: document.getElementById('installmentStart').value,
        idPlanejamento: '' // ✅ Sempre enviar vazio para itens globais
    };
    
    appData.parcelados.push(parcela);
    syncItemToPlan(parcela, 'parcelados', 'add');
    
    // ✅ Adicionar tratamento de erro
    callBackend('adicionar', 'parcelados', parcela)
        .then(() => {
            updateAll();
            e.target.reset();
            setTodayDates();
            showToast('Sucesso!', 'Parcelamento cadastrado', 'success');
        })
        .catch(err => {
            console.error('Erro ao salvar parcelamento:', err);
            // Remover do array se falhou
            appData.parcelados = appData.parcelados.filter(p => p.id !== parcela.id);
            updateAll();
        });
});

function payInstallment(id) {
    const item = appData.parcelados.find(p => p.id === id);
    if (item && item.parcelasPagas < item.parcelas) {
        item.parcelasPagas++;
        syncItemToPlan(item, 'parcelados', 'update');
        callBackend('atualizar', 'parcelados', item);
        updateAll();
        showToast('Sucesso!', `Parcela ${item.parcelasPagas}/${item.parcelas} paga`, 'success');
    }
}

function deleteInstallment(id) {
    if (confirm('Excluir este parcelamento?')) {
        const item = appData.parcelados.find(p => p.id === id);
        appData.parcelados = appData.parcelados.filter(p => p.id !== id);
        
        if (item) syncItemToPlan(item, 'parcelados', 'delete');
        callBackend('excluir', 'parcelados', id);
        
        updateAll();
        showToast('Sucesso!', 'Parcelamento excluído', 'success');
    }
}

// ========== PLANEJAMENTOS ==========
function showNewPlanningModal() {
    document.getElementById('newPlanningModal').classList.add('active');
}

document.getElementById('formNewPlanning').addEventListener('submit', e => {
    e.preventDefault();
    const plan = {
        id: generateId(),
        nome: document.getElementById('planName').value,
        saldoInicial: parseFloat(document.getElementById('planBalance').value),
        dataInicio: document.getElementById('planStartDate').value,
        dataFim: document.getElementById('planEndDate').value,
        ativo: true,
        dadosJSON: '{}'
    };

    if (activePlanning) activePlanning.ativo = false;
    appData.planejamentos.push(plan);
    activePlanning = plan;
    syncGlobalDataToPlan();
    
    // ✅ Adicionar tratamento de erro
    callBackend('adicionar', 'planejamentos', plan)
        .then(() => {
            // Desativar planejamentos antigos
            if (appData.planejamentos.length > 1) {
                const oldPlans = appData.planejamentos.filter(p => p.id !== plan.id && p.ativo);
                oldPlans.forEach(oldPlan => {
                    oldPlan.ativo = false;
                    callBackend('atualizar', 'planejamentos', oldPlan)
                        .catch(err => console.error('Erro ao desativar planejamento antigo:', err));
                });
            }
            
            updateAll();
            closeModal('newPlanningModal');
            e.target.reset();
            setTodayDates();
            showToast('Sucesso!', 'Planejamento criado', 'success');
        })
        .catch(err => {
            console.error('Erro ao salvar planejamento:', err);
            // Remover do array se falhou
            appData.planejamentos = appData.planejamentos.filter(p => p.id !== plan.id);
            activePlanning = null;
            updateAll();
        });
});

async function ativarPlanejamento(id) {
    const plan = appData.planejamentos.find(p => p.id === id);
    if (!plan) return;
    
    if (activePlanning) activePlanning.ativo = false;
    plan.ativo = true;
    activePlanning = plan;
    
    try {
        const planData = JSON.parse(plan.dadosJSON || '{}');
        if (planData.items) activePlanning.items = planData.items;
        else syncGlobalDataToPlan();
    } catch (e) { syncGlobalDataToPlan(); }
    
    await callBackend('atualizar', 'planejamentos', plan);
    
    const oldPlans = appData.planejamentos.filter(p => p.id !== id && p.ativo);
    for (const old of oldPlans) {
        old.ativo = false;
        await callBackend('atualizar', 'planejamentos', old);
    }
    
    updateAll();
    showToast('Sucesso!', 'Planejamento ativado', 'success');
}

function desativarPlanejamento() {
    if (!activePlanning) return;
    if (confirm('Desativar planejamento atual?')) {
        activePlanning.ativo = false;
        savePlanningData();
        callBackend('atualizar', 'planejamentos', activePlanning);
        activePlanning = null;
        updateAll();
        showToast('Sucesso!', 'Planejamento desativado', 'success');
    }
}

function finalizarPlanejamento() {
    if (!activePlanning) return;
    if (confirm('Finalizar este planejamento?')) {
        activePlanning.ativo = false;
        savePlanningData();
        callBackend('atualizar', 'planejamentos', activePlanning);
        activePlanning = null;
        updateAll();
        showToast('Sucesso!', 'Planejamento finalizado', 'success');
    }
}

function deletePlanning(id) {
    if (confirm('Excluir este planejamento permanentemente?')) {
        appData.planejamentos = appData.planejamentos.filter(p => p.id !== id);
        if (activePlanning && activePlanning.id === id) activePlanning = null;
        callBackend('excluir', 'planejamentos', id);
        updateAll();
        showToast('Sucesso!', 'Planejamento excluído', 'success');
    }
}
// ========== DETALHES DOS MESES ==========
function selectMonth(monthKey) {
    selectedMonth = monthKey;
    updatePlanning();
    showMonthDetails(monthKey);
}

function showMonthDetails(monthKey) {
    const months = getMonthsInPlan();
    const month = months.find(m => m.key === monthKey);
    if (!month) return;
    document.getElementById('monthDetailsTitle').textContent = `📅 ${month.name}`;
    currentItemType = 'fluxo';
    const tabs = document.querySelectorAll('.item-type-tab');
    tabs.forEach(t => t.classList.remove('active'));
    tabs[0].classList.add('active');
    renderDailyFlow();
    document.getElementById('monthDetailsModal').classList.add('active');
}

function switchItemType(type) {
    currentItemType = type;
    document.querySelectorAll('.item-type-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    if (type === 'fluxo') {
        renderDailyFlow();
    } else {
        renderMonthItems();
    }
}

function renderMonthItems() {
    if (!selectedMonth) return;
    const items = getItemsForMonth(selectedMonth);
    const currentItems = items[currentItemType] || [];
    const container = document.getElementById('monthItemsContainer');

    if (currentItems.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">${getTypeIcon(currentItemType)}</div><div class="empty-text">Nenhum item</div></div>`;
        return;
    }

    container.innerHTML = `<div class="month-item-list">${currentItems.map((item, idx) => {
        let value = item.valorEditado !== undefined ? item.valorEditado : (item.valorMensal || item.valor || (item.valorTotal / item.parcelas) || 0);
        const isEdited = item.valorEditado !== undefined || item.dataEditada;
        const isNew = item.novo;
        const isExcluded = item.incluido === false;
        
        return `<div class="month-item ${isEdited ? 'edited' : ''} ${isNew ? 'new' : ''}">
        <div class="month-item-header">
            <div class="month-item-info">
                <div class="month-item-name">${item.descricao || item.nome}
                    ${isEdited ? '<span class="badge badge-editado">Editado</span>' : ''}
                    ${isNew ? '<span class="badge badge-novo">Novo</span>' : ''}
                    ${isExcluded ? '<span class="badge badge-excluido">Excluído</span>' : ''}
                </div>
                <div class="month-item-details">${getItemDetails(item, currentItemType)}</div>
            </div>
            <div class="month-item-value">${formatMoney(value)}</div>
        </div>
        ${!isExcluded ? `<div class="month-item-actions">
            <button class="edit-btn" onclick="editMonthItem(${idx})">✏️ Editar</button>
            <button class="remove-btn" onclick="removeMonthItem(${idx})">🗑️ Remover</button>
        </div>` : ''}
    </div>`
    }).join('')}</div>`;
}

function renderDailyFlow() {
    if (!selectedMonth) return;
    
    const dias = calculateDailyFlow(selectedMonth);
    const container = document.getElementById('monthItemsContainer');
    
    if (dias.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">Erro ao calcular fluxo</div></div>';
        return;
    }
    
    let html = '<div class="daily-flow-list">';
    
    dias.forEach(dia => {
        const temMovimentacao = dia.entradas.length > 0 || dia.saidas.length > 0;
        const saldoClass = dia.saldo < 0 ? 'negative' : 'positive';
        
        // Formatar data
        const dataObj = new Date(dia.data + 'T00:00:00');
        const diaSemana = dataObj.toLocaleDateString('pt-BR', { weekday: 'short' });
        const diaFormatado = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        
        html += `
            <div class="daily-flow-item ${temMovimentacao ? 'has-movement' : ''}">
                <div class="daily-flow-header">
                    <div class="daily-flow-date">
                        <div class="daily-flow-day">${diaSemana} ${diaFormatado}</div>
                    </div>
                    <div class="daily-flow-balance ${saldoClass}">
                        ${formatMoney(dia.saldo)}
                    </div>
                </div>`;
        
        if (temMovimentacao) {
            html += '<div class="daily-flow-movements">';
            
            // Entradas
            dia.entradas.forEach(entrada => {
                html += `
                    <div class="daily-flow-movement entrada">
                        <span class="movement-icon">📥</span>
                        <span class="movement-desc">${entrada.descricao}</span>
                        <span class="movement-value positive">${formatMoney(entrada.valor)}</span>
                    </div>`;
            });
            
            // Saídas
            dia.saidas.forEach(saida => {
                html += `
                    <div class="daily-flow-movement saida">
                        <span class="movement-icon">📤</span>
                        <span class="movement-desc">${saida.descricao}</span>
                        <span class="movement-value negative">${formatMoney(saida.valor)}</span>
                    </div>`;
            });
            
            html += '</div>';
            
            // Totais do dia
            if (dia.totalEntradas > 0 || dia.totalSaidas > 0) {
                html += `
                    <div class="daily-flow-totals">
                        ${dia.totalEntradas > 0 ? `<span class="total-in">+${formatMoney(dia.totalEntradas)}</span>` : ''}
                        ${dia.totalSaidas > 0 ? `<span class="total-out">-${formatMoney(dia.totalSaidas)}</span>` : ''}
                    </div>`;
            }
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    
    container.innerHTML = html;
}

function getItemDetails(item, type) {
    if (type === 'fixos') return `${item.categoria || ''} • Dia ${item.diaVencimento}`;
    if (type === 'rendas') return item.dataEditada || item.data ? formatDate(item.dataEditada || item.data) : (item.recorrente ? 'Recorrente' : '');
    if (type === 'parcelados') return `${item.numeroParcela || 1}/${item.parcelas} parcelas`;
    if (type === 'gastos') return `${item.categoria || ''} • ${formatDate(item.dataEditada || item.data)}`;
    if (type === 'metas') return `Meta: ${formatMoney(item.valorTotal)}`;
    return '';
}

// ========== EDIÇÃO E REMOÇÃO DE ITENS ==========
function editMonthItem(idx) {
    const items = getItemsForMonth(selectedMonth);
    const item = items[currentItemType][idx];
    
    editingItem = {
        monthKey: selectedMonth,
        type: currentItemType,
        index: idx,
        item: item
    };
    
    const currentValue = item.valorEditado !== undefined ? item.valorEditado : (item.valorMensal || item.valor || (item.valorTotal / item.parcelas) || 0);
    const currentDate = item.dataEditada || item.data || '';
    
    let formHTML = `
    <div class="form-group">
        <label class="form-label">💰 Valor</label>
        <input type="number" class="form-input" id="editValue" value="${currentValue}" step="0.01" required>
    </div>
`;

if (currentItemType === 'rendas' || currentItemType === 'gastos') {
    formHTML += `
        <div class="form-group">
            <label class="form-label">📅 Data</label>
            <input type="date" class="form-input" id="editDate" value="${currentDate}">
        </div>
    `;
} else if (currentItemType === 'fixos') {
    formHTML += `
        <div class="form-group">
            <label class="form-label">📅 Dia do Vencimento</label>
            <input type="number" class="form-input" id="editDay" value="${item.diaVencimento}" min="1" max="31" required>
        </div>
    `;
} else if (currentItemType === 'parcelados') {
    const dataInicio = item.dataInicio || currentDate;
    formHTML += `
        <div class="form-group">
            <label class="form-label">📅 Data da Parcela</label>
            <input type="date" class="form-input" id="editDate" value="${dataInicio}">
        </div>
    `;
}
    
    document.getElementById('editItemContent').innerHTML = formHTML;
    document.getElementById('editItemTitle').textContent = `✏️ Editar ${item.descricao || item.nome}`;
    document.getElementById('applyToFuture').checked = false;
    document.getElementById('editItemModal').classList.add('active');
}

document.getElementById('formEditItem').addEventListener('submit', e => {
    e.preventDefault();
    if (!editingItem) return;
    
  const newValue = parseFloat(document.getElementById('editValue').value);
const newDate = document.getElementById('editDate')?.value;
const newDay = document.getElementById('editDay')?.value;
const applyToFuture = document.getElementById('applyToFuture').checked;

const item = activePlanning.items[editingItem.monthKey][editingItem.type][editingItem.index];

item.valorEditado = newValue;

if (editingItem.type === 'fixos' && newDay) {
    item.diaVencimento = parseInt(newDay);
} else if (newDate) {
    item.dataEditada = newDate;
}
    
    syncPlanToGlobal(item, editingItem.type, 'edit');
    
    if (applyToFuture) {
    const months = getMonthsInPlan();
    const currentIdx = months.findIndex(m => m.key === editingItem.monthKey);
    
    for (let i = currentIdx + 1; i < months.length; i++) {
        const futureMonthKey = months[i].key;
        const futureItems = activePlanning.items[futureMonthKey][editingItem.type];
        const futureItem = futureItems.find(it => it.id === item.id);
        
        if (futureItem) {
            futureItem.valorEditado = newValue;
            
            if (editingItem.type === 'fixos' && newDay) {
                futureItem.diaVencimento = parseInt(newDay);
            } else if (newDate && (editingItem.type === 'rendas' || editingItem.type === 'gastos')) {
                const futureDate = new Date(newDate);
                futureDate.setMonth(futureDate.getMonth() + (i - currentIdx));
                futureItem.dataEditada = futureDate.toISOString().split('T')[0];
            } else if (editingItem.type === 'parcelados' && newDate) {
                const futureDate = new Date(newDate);
                futureDate.setMonth(futureDate.getMonth() + (i - currentIdx));
                futureItem.dataEditada = futureDate.toISOString().split('T')[0];
            }
        }
    }
}
    
    savePlanningData();
    updateAll();
    renderMonthItems();
    closeModal('editItemModal');
    
    const msg = applyToFuture ? 'Item atualizado em todos os meses' : 'Item atualizado';
    showToast('Sucesso!', msg, 'success');
    editingItem = null;
});

function removeMonthItem(idx) {
    const items = getItemsForMonth(selectedMonth);
    const item = items[currentItemType][idx];
    
    if (!confirm(`Remover este item?\n\n${item.descricao || item.nome}`)) return;
    
    const removeFromFuture = confirm('Remover também dos meses posteriores?');
    
    activePlanning.items[selectedMonth][currentItemType][idx].incluido = false;
    
    syncPlanToGlobal(item, currentItemType, 'remove');
    
    if (removeFromFuture) {
        const months = getMonthsInPlan();
        const currentIdx = months.findIndex(m => m.key === selectedMonth);
        
        for (let i = currentIdx + 1; i < months.length; i++) {
            const futureMonthKey = months[i].key;
            const futureItems = activePlanning.items[futureMonthKey][currentItemType];
            const futureItemIdx = futureItems.findIndex(it => it.id === item.id);
            
            if (futureItemIdx !== -1) {
                futureItems[futureItemIdx].incluido = false;
            }
        }
    }
    
    savePlanningData();
    updateAll();
    renderMonthItems();
    
    const msg = removeFromFuture ? 'Item removido de todos os meses' : 'Item removido deste mês';
    showToast('Sucesso!', msg, 'success');
}

// ========== HANDLER DE ADICIONAR ITEM NO PLANEJAMENTO ==========
document.getElementById('formAddItem').addEventListener('submit', e => {
    e.preventDefault();
    
    const type = currentItemType;
    const desc = document.getElementById('newItemDesc').value;
    const checkbox = document.getElementById('addToFuture');
    const addToFuture = checkbox ? checkbox.checked : false;
    
    let newItem = { 
        id: generateId(), 
        incluido: true, 
        novo: true 
    };
    
    if (type === 'fixos') {
        newItem = {
            ...newItem,
            descricao: desc,
            valor: parseFloat(document.getElementById('newItemValue').value),
            diaVencimento: parseInt(document.getElementById('newItemDay').value),
            categoria: document.getElementById('newItemCategory').value,
            ativo: true
        };
    } else if (type === 'rendas') {
        newItem = {
            ...newItem,
            descricao: desc,
            valor: parseFloat(document.getElementById('newItemValue').value),
            data: document.getElementById('newItemDate').value,
            recorrente: document.getElementById('newItemRecurring')?.checked || false
        };
    } else if (type === 'parcelados') {
        const total = parseFloat(document.getElementById('newItemTotal').value);
        const parcelas = parseInt(document.getElementById('newItemParcelas').value);
        newItem = {
            ...newItem,
            descricao: desc,
            valorTotal: total,
            parcelas: parcelas,
            parcelasPagas: 0,
            dataInicio: document.getElementById('newItemDate').value,
            numeroParcela: 1
        };
    } else if (type === 'gastos') {
        newItem = {
            ...newItem,
            descricao: desc,
            valor: parseFloat(document.getElementById('newItemValue').value),
            data: document.getElementById('newItemDate').value,
            categoria: document.getElementById('newItemCategory').value,
            pago: document.getElementById('newItemPaid')?.checked || false
        };
    } else if (type === 'metas') {
        newItem = {
            ...newItem,
            nome: desc,
            valorTotal: parseFloat(document.getElementById('newItemTotal').value),
            valorMensal: parseFloat(document.getElementById('newItemMonthly').value),
            valorAtual: 0,
            dataObjetivo: document.getElementById('newItemDate')?.value || null,
            ativa: true
        };
        delete newItem.descricao;
    }
    
    activePlanning.items[selectedMonth][type].push({ ...newItem });
    
    if (addToFuture) {
        const months = getMonthsInPlan();
        const currentIdx = months.findIndex(m => m.key === selectedMonth);
        
        for (let i = currentIdx + 1; i < months.length; i++) {
            const monthKey = months[i].key;
            
            if (type === 'parcelados') {
                const parcelaNumero = i - currentIdx + 1;
                if (parcelaNumero <= newItem.parcelas) {
                    activePlanning.items[monthKey][type].push({ 
                        ...newItem, 
                        numeroParcela: parcelaNumero 
                    });
                }
            } else {
                activePlanning.items[monthKey][type].push({ ...newItem });
            }
        }
        
        appData[type].push(newItem);
        callBackend('adicionar', type, newItem);
    }
    
    savePlanningData();
    updateAll();
    renderMonthItems();
    closeModal('addItemModal');
    
    const msg = addToFuture ? 'Item adicionado em todos os meses posteriores' : 'Item adicionado neste mês';
    showToast('Sucesso!', msg, 'success');
});

// ========== GRÁFICOS E HISTÓRICO ==========
function updateHistory() {
    updateCategoryChart();
    updateMonthlyChart();
}

function updateCategoryChart() {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    
    if (charts.category) charts.category.destroy();
    
    const categoryData = {};
    appData.gastos.forEach(g => {
        const cat = g.categoria || 'Outros';
        categoryData[cat] = (categoryData[cat] || 0) + g.valor;
    });
    
    charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryData),
            datasets: [{
                data: Object.values(categoryData),
                backgroundColor: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function updateMonthlyChart() {
    const ctx = document.getElementById('monthlyChart');
    if (!ctx) return;
    
    if (charts.monthly) charts.monthly.destroy();
    
    const monthlyData = {};
    appData.gastos.forEach(g => {
        const month = g.data.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + g.valor;
    });
    
    const sorted = Object.keys(monthlyData).sort();
    
    charts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted,
            datasets: [{
                label: 'Gastos',
                data: sorted.map(m => monthlyData[m]),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function ajustarSaldoAtual() {
    if (!activePlanning) {
        showToast('Erro', 'Nenhum planejamento ativo', 'warning');
        return;
    }
    
    const months = getMonthsInPlan();
    const today = new Date();
    
    // Preencher dropdown com meses
    const selectMonth = document.getElementById('adjustMonth');
    selectMonth.innerHTML = months.map(m => {
        const monthDate = new Date(m.date);
        const isPast = monthDate < today;
        const isCurrent = monthDate.getMonth() === today.getMonth() && 
                         monthDate.getFullYear() === today.getFullYear();
        
        let label = m.name;
        if (isCurrent) label += ' (MÊS ATUAL)';
        else if (isPast) label += ' (passado)';
        
        return `<option value="${m.key}" ${isCurrent ? 'selected' : ''}>${label}</option>`;
    }).join('');
    
    // Calcular saldo atual do mês selecionado
    const currentMonthKey = selectMonth.value;
    const projection = calculatePlanningProjection();
    const currentMonth = projection ? projection.find(p => p.key === currentMonthKey) : null;
    
    if (currentMonth) {
        document.getElementById('adjustNewBalance').value = currentMonth.saldo.toFixed(2);
    }
    
    document.getElementById('adjustBalanceModal').classList.add('active');
}

document.getElementById('formAdjustBalance').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!activePlanning) return;
    
    const monthKey = document.getElementById('adjustMonth').value;
    const newBalance = parseFloat(document.getElementById('adjustNewBalance').value);
    const reason = document.getElementById('adjustReason').value;
    
    if (isNaN(newBalance)) {
        showToast('Erro', 'Digite um valor válido', 'warning');
        return;
    }
    
    // Calcular quanto precisa ajustar
    const projection = calculatePlanningProjection();
    const targetMonth = projection.find(p => p.key === monthKey);
    
    if (!targetMonth) {
        showToast('Erro', 'Mês não encontrado', 'error');
        return;
    }
    
    const difference = newBalance - targetMonth.saldo;
    
    // Criar um ajuste como "renda" ou "gasto" dependendo se é positivo ou negativo
    const adjustmentItem = {
        id: generateId(),
        descricao: reason || `Ajuste de saldo (${difference > 0 ? 'Correção positiva' : 'Correção negativa'})`,
        valor: Math.abs(difference),
        data: monthKey + '-15', // Meio do mês
        incluido: true,
        novo: true,
        ajusteSaldo: true // Flag especial
    };
    
    if (!activePlanning.items[monthKey]) {
        activePlanning.items[monthKey] = {
            fixos: [], rendas: [], parcelados: [], gastos: [], metas: []
        };
    }
    
    // Se diferença positiva = adicionar renda, se negativa = adicionar gasto
    if (difference > 0) {
        activePlanning.items[monthKey].rendas.push(adjustmentItem);
    } else if (difference < 0) {
        activePlanning.items[monthKey].gastos.push(adjustmentItem);
    }
    
    savePlanningData();
    updateAll();
    closeModal('adjustBalanceModal');
    
    const msg = difference > 0 
        ? `Saldo ajustado! Adicionado ${formatMoney(Math.abs(difference))} como correção` 
        : `Saldo ajustado! Removido ${formatMoney(Math.abs(difference))} como correção`;
    
    showToast('Sucesso!', msg, 'success');
    
    e.target.reset();
});

console.log('✅ Sistema completo carregado');
</script>
</body>
</html>
