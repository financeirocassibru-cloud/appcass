const ABAS = {
  USUARIOS: 'Usuários',
  GASTOS: 'Gastos',
  RENDAS: 'Rendas',
  FIXOS: 'Custos Fixos',
  METAS: 'Metas',
  PARCELADOS: 'Parcelas',
  CATEGORIAS: 'Categorias Personalizadas',
  PLANEJAMENTOS: 'Planejamentos',
  CICLOS: 'Ciclos'
};

const SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 Finanças')
    .addItem('🚀 Abrir App', 'abrirApp')
    .addSeparator()
    .addItem('⚙️ Inicializar Planilha', 'inicializarPlanilha')
    .addToUi();
}

function abrirApp() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '💰 Minhas Finanças');
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Minhas Finanças')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

function inicializarPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  criarOuLimparAba(ss, ABAS.USUARIOS, [
    'ID', 'Nome', 'Email', 'Senha Hash', 'Data Cadastro', 'Último Acesso'
  ]);
  
  criarOuLimparAba(ss, ABAS.GASTOS, [
    'ID', 'Email Usuário', 'Data', 'Descrição', 'Valor', 'Categoria', 
    'Observações', 'Pago', 'ID Planejamento', 'Data Cadastro'
  ]);
  
  criarOuLimparAba(ss, ABAS.RENDAS, [
    'ID', 'Email Usuário', 'Data', 'Descrição', 'Valor', 'Recorrente', 
    'ID Planejamento', 'Data Cadastro'
  ]);
  
  criarOuLimparAba(ss, ABAS.FIXOS, [
    'ID', 'Email Usuário', 'Descrição', 'Valor', 'Dia Vencimento', 
    'Categoria', 'Ativo', 'ID Planejamento', 'Data Cadastro' // ✅ Adicionar coluna
]);

  criarOuLimparAba(ss, ABAS.METAS, [
    'ID', 'Email Usuário', 'Nome', 'Valor Total', 'Valor Atual', 
    'Data Objetivo', 'Ativa', 'Data Cadastro'
  ]);
  
  criarOuLimparAba(ss, ABAS.PARCELADOS, [
    'ID', 'Email Usuário', 'Descrição', 'Valor Total', 'Parcelas', 
    'Parcelas Pagas', 'Data Início', 'Data Cadastro'
  ]);
  
  criarOuLimparAba(ss, ABAS.CATEGORIAS, [
    'Categoria', 'Data Cadastro'
  ]);
  
  criarOuLimparAba(ss, ABAS.PLANEJAMENTOS, [
    'ID', 'Email Usuário', 'Nome', 'Saldo Inicial', 'Data Início', 
    'Data Fim', 'Ativo', 'Dados JSON', 'Data Criação'
  ]);
  
  criarOuLimparAba(ss, ABAS.CICLOS, [
    'ID', 'Email Usuário', 'ID Planejamento', 'Data Início', 'Data Fim', 
    'Status', 'Dados JSON', 'Data Cadastro'
  ]);
  
  const abaCat = ss.getSheetByName(ABAS.CATEGORIAS);
  if (abaCat.getLastRow() <= 1) {
    const cats = ['Mercado', 'Farmácia', 'Alimentação', 'Transporte', 'Luz', 'Água', 'Internet', 'Celular', 'Outros'];
    cats.forEach(cat => abaCat.appendRow([cat, new Date()]));
  }
  
  SpreadsheetApp.getUi().alert('✅ Planilha inicializada!\n\nAgora use: 💰 Finanças > 🚀 Abrir App');
}

function criarOuLimparAba(ss, nomeAba, cabecalhos) {
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    aba = ss.insertSheet(nomeAba);
  }
  
  if (aba.getLastRow() === 0) {
    const headerRange = aba.getRange(1, 1, 1, cabecalhos.length);
    headerRange.setValues([cabecalhos])
      .setBackground('#667eea')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    
    aba.setFrozenRows(1);
    
    for (let i = 1; i <= cabecalhos.length; i++) {
      aba.autoResizeColumn(i);
    }
  }
}

function hashSenha(senha) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, 
    senha, 
    Utilities.Charset.UTF_8
  );
  return rawHash.map(byte => {
    const v = (byte < 0) ? 256 + byte : byte;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function criarUsuario(nome, email, senha) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.USUARIOS);
    
    if (!aba) {
      throw new Error('Planilha não inicializada');
    }
    
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][2]).toLowerCase() === email.toLowerCase()) {
        return { success: false, message: 'Este e-mail já está cadastrado' };
      }
    }
    
    const id = gerarId();
    const senhaHash = hashSenha(senha);
    
    aba.appendRow([id, nome, email.toLowerCase(), senhaHash, new Date(), new Date()]);
    
    formatarUltimaLinha(aba);
    Logger.log(`Usuário criado: ${email}`);
    
    return { success: true, message: 'Conta criada com sucesso!' };
  } catch (e) {
    Logger.log('Erro em criarUsuario: ' + e);
    return { success: false, message: 'Erro ao criar conta: ' + e.toString() };
  }
}

function fazerLogin(email, senha) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.USUARIOS);
    
    if (!aba) {
      throw new Error('Planilha não inicializada');
    }
    
    const dados = aba.getDataRange().getValues();
    const senhaHash = hashSenha(senha);
    
    for (let i = 1; i < dados.length; i++) {
      const userEmail = String(dados[i][2]).toLowerCase();
      const userHash = String(dados[i][3]);
      
      if (userEmail === email.toLowerCase() && userHash === senhaHash) {
        const usuario = {
          id: String(dados[i][0]),
          nome: String(dados[i][1]),
          email: userEmail
        };
        
        aba.getRange(i + 1, 6).setValue(new Date());
        criarSessao(usuario);
        
        Logger.log(`Login bem-sucedido: ${email}`);
        return { success: true, user: usuario };
      }
    }
    
    Logger.log(`Login falhou: ${email}`);
    return { success: false, message: 'E-mail ou senha incorretos' };
  } catch (e) {
    Logger.log('Erro em fazerLogin: ' + e);
    return { success: false, message: 'Erro ao fazer login: ' + e.toString() };
  }
}

function verificarUsuarioExiste(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.USUARIOS);
    
    if (!aba) {
      return { success: false, message: 'Planilha não inicializada' };
    }
    
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      const userEmail = String(dados[i][2]).toLowerCase();
      if (userEmail === email.toLowerCase()) {
        const usuario = {
          id: String(dados[i][0]),
          nome: String(dados[i][1]),
          email: userEmail
        };
        
        aba.getRange(i + 1, 6).setValue(new Date());
        Logger.log(`Login automático: ${email}`);
        
        return { success: true, user: usuario };
      }
    }
    
    return { success: false, message: 'Usuário não encontrado' };
  } catch (e) {
    Logger.log('Erro em verificarUsuarioExiste: ' + e);
    return { success: false, message: 'Erro ao verificar usuário: ' + e.toString() };
  }
}

function criarSessao(usuario) {
  const sessionData = {
    usuario: usuario,
    timestamp: new Date().getTime()
  };
  
  const userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('session', JSON.stringify(sessionData));
  
  Logger.log(`Sessão criada para: ${usuario.email}`);
}

function verificarSessao() {
  try {
    const userProperties = PropertiesService.getUserProperties();
    const sessionStr = userProperties.getProperty('session');
    
    if (!sessionStr) {
      return null;
    }
    
    const sessionData = JSON.parse(sessionStr);
    const now = new Date().getTime();
    
    if (now - sessionData.timestamp > SESSION_TIMEOUT) {
      userProperties.deleteProperty('session');
      Logger.log('Sessão expirada');
      return null;
    }
    
    Logger.log(`Sessão válida: ${sessionData.usuario.email}`);
    return sessionData.usuario;
  } catch (e) {
    Logger.log('Erro em verificarSessao: ' + e);
    return null;
  }
}

function obterUsuarioLogado() {
  const usuario = verificarSessao();
  if (!usuario) {
    throw new Error('Usuário não autenticado');
  }
  return usuario;
}

function fazerLogout() {
  try {
    const userProperties = PropertiesService.getUserProperties();
    userProperties.deleteProperty('session');
    Logger.log('Logout realizado');
    return { success: true };
  } catch (e) {
    Logger.log('Erro em fazerLogout: ' + e);
    return { success: false };
  }
}

function carregarDadosUsuario() {
  try {
    const usuario = obterUsuarioLogado();
    
    const dados = {
      gastos: lerGastosUsuario(usuario.email) || [],
      rendas: lerRendasUsuario(usuario.email) || [],
      fixos: lerFixosUsuario(usuario.email) || [],
      metas: lerMetasUsuario(usuario.email) || [],
      parcelados: lerParceladosUsuario(usuario.email) || [],
      categorias: lerCategorias() || [],
      planejamentos: lerPlanejamentosUsuario(usuario.email) || [],
      ciclos: lerCiclosUsuario(usuario.email) || []
    };
    
    Logger.log(`Dados carregados para: ${usuario.email}`);
    return dados;
  } catch (e) {
    Logger.log('Erro ao carregar dados: ' + e);
    throw new Error('Erro ao carregar dados: ' + e.toString());
  }
}

function lerGastosUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.GASTOS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => ({
        id: String(d[0]),
        data: formatarDataISO(d[2]),
        descricao: String(d[3]),
        valor: Number(d[4]) || 0,
        categoria: String(d[5]),
        observacoes: String(d[6] || ''),
        pago: Boolean(d[7]),
        idPlanejamento: String(d[8] || '')
      }));
  } catch (e) {
    Logger.log('Erro em lerGastosUsuario: ' + e);
    return [];
  }
}

function lerRendasUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.RENDAS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => ({
        id: String(d[0]),
        data: formatarDataISO(d[2]),
        descricao: String(d[3]),
        valor: Number(d[4]) || 0,
        recorrente: Boolean(d[5]),
        idPlanejamento: String(d[6] || '')
      }));
  } catch (e) {
    Logger.log('Erro em lerRendasUsuario: ' + e);
    return [];
  }
}

function lerFixosUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.FIXOS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => ({
        id: String(d[0]),
        descricao: String(d[2]),
        valor: Number(d[3]) || 0,
        diaVencimento: Number(d[4]) || 1,
        categoria: String(d[5]),
        ativo: d[6] !== false
      }));
  } catch (e) {
    Logger.log('Erro em lerFixosUsuario: ' + e);
    return [];
  }
}

function lerMetasUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.METAS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const numRows = aba.getLastRow() - 1;
    const numCols = aba.getLastColumn() || 8; // ✅ Usar || em vez de Math.max
    
    // ✅ Validar antes de chamar getRange
    if (numRows <= 0 || numCols <= 0) return [];
    
    const dados = aba.getRange(2, 1, numRows, numCols).getValues();
    
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => {
        const meta = {
          id: String(d[0]),
          nome: String(d[2] || 'Meta sem nome'),
          valorTotal: Number(d[3]) || 0,
          valorAtual: Number(d[4]) || 0,
          dataObjetivo: d[5] ? formatarDataISO(d[5]) : null,
          ativa: true
        };
        
        // ✅ Verificar coluna "ativa" com segurança
        if (numCols >= 7 && d[6] !== undefined && d[6] !== null && d[6] !== '') {
          meta.ativa = Boolean(d[6]);
        }
        
        return meta;
      });
  } catch (e) {
    Logger.log('Erro em lerMetasUsuario: ' + e);
    return [];
  }
}

function lerParceladosUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.PARCELADOS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => ({
        id: String(d[0]),
        descricao: String(d[2]),
        valorTotal: Number(d[3]) || 0,
        parcelas: Number(d[4]) || 1,
        parcelasPagas: Number(d[5]) || 0,
        dataInicio: formatarDataISO(d[6])
      }));
  } catch (e) {
    Logger.log('Erro em lerParceladosUsuario: ' + e);
    return [];
  }
}

function lerPlanejamentosUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.PLANEJAMENTOS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => ({
        id: String(d[0]),
        nome: String(d[2]),
        saldoInicial: Number(d[3]) || 0,
        dataInicio: formatarDataISO(d[4]),
        dataFim: formatarDataISO(d[5]),
        ativo: Boolean(d[6]),
        dadosJSON: String(d[7] || '{}'),
        dataCriacao: formatarDataISO(d[8])
      }));
  } catch (e) {
    Logger.log('Erro em lerPlanejamentosUsuario: ' + e);
    return [];
  }
}

function lerCiclosUsuario(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.CICLOS);
    if (!aba || aba.getLastRow() <= 1) return [];
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
    return dados
      .filter(d => d[0] && String(d[1]).toLowerCase() === email.toLowerCase())
      .map(d => ({
        id: String(d[0]),
        idPlanejamento: String(d[2]),
        dataInicio: formatarDataISO(d[3]),
        dataFim: d[4] ? formatarDataISO(d[4]) : null,
        status: String(d[5] || 'ativo'),
        dadosJSON: String(d[6] || '{}'),
        dataCadastro: formatarDataISO(d[7])
      }));
  } catch (e) {
    Logger.log('Erro em lerCiclosUsuario: ' + e);
    return [];
  }
}

function lerCategorias() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.CATEGORIAS);
    
    if (!aba || aba.getLastRow() <= 1) {
      return ['Mercado', 'Farmácia', 'Alimentação', 'Transporte', 'Luz', 'Água', 'Internet', 'Celular', 'Outros'];
    }
    
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
    const categorias = dados.filter(d => d[0]).map(d => String(d[0]));
    
    return categorias.length > 0 ? categorias : ['Mercado', 'Farmácia', 'Alimentação', 'Transporte', 'Luz', 'Água', 'Internet', 'Celular', 'Outros'];
  } catch (e) {
    Logger.log('Erro em lerCategorias: ' + e);
    return ['Mercado', 'Farmácia', 'Alimentação', 'Transporte', 'Luz', 'Água', 'Internet', 'Celular', 'Outros'];
  }
}

function adicionarCategoria(categoria) {
  try {
    obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.CATEGORIAS);
    aba.appendRow([categoria, new Date()]);
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarCategoria: ' + e);
    throw e;
  }
}

function adicionarGasto(gasto) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.GASTOS);
    
    aba.appendRow([
      gasto.id, usuario.email, gasto.data, gasto.descricao, gasto.valor,
      gasto.categoria, gasto.observacoes || '', gasto.pago || false,
      gasto.idPlanejamento || '', new Date()
    ]);
    
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarGasto: ' + e);
    throw e;
  }
}

function adicionarRenda(renda) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.RENDAS);
    
    aba.appendRow([
      renda.id, usuario.email, renda.data, renda.descricao, renda.valor,
      renda.recorrente || false, renda.idPlanejamento || '', new Date()
    ]);
    
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarRenda: ' + e);
    throw e;
  }
}

function adicionarFixo(fixo) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.FIXOS);
    
    // ✅ Verificar se a aba tem coluna para idPlanejamento
    const numCols = aba.getLastColumn();
    
    if (numCols < 9) {
      // Adicionar coluna "ID Planejamento" se não existir
      aba.getRange(1, 8).setValue('ID Planejamento');
    }
    
    aba.appendRow([
      fixo.id, 
      usuario.email, 
      fixo.descricao, 
      fixo.valor,
      fixo.diaVencimento, 
      fixo.categoria, 
      true, 
      fixo.idPlanejamento || '', // ✅ Adicionar campo
      new Date()
    ]);
    
    formatarUltimaLinha(aba);
    Logger.log(`✅ Fixo adicionado: ${fixo.id}`);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarFixo: ' + e);
    throw e;
  }
}

function adicionarMeta(meta) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.METAS);
    
    aba.appendRow([
      meta.id, usuario.email, meta.nome, meta.valorTotal,
      meta.valorAtual || 0, meta.dataObjetivo || '', meta.ativa !== false, new Date()
    ]);
    
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarMeta: ' + e);
    throw e;
  }
}

function adicionarParcelado(parcelado) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.PARCELADOS);
    
    aba.appendRow([
      parcelado.id, usuario.email, parcelado.descricao, parcelado.valorTotal,
      parcelado.parcelas, parcelado.parcelasPagas || 0, parcelado.dataInicio, new Date()
    ]);
    
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarParcelado: ' + e);
    throw e;
  }
}

function adicionarPlanejamento(plan) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.PLANEJAMENTOS);
    
    aba.appendRow([
      plan.id, usuario.email, plan.nome, plan.saldoInicial,
      plan.dataInicio, plan.dataFim, true, plan.dadosJSON || '{}', new Date()
    ]);
    
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarPlanejamento: ' + e);
    throw e;
  }
}

function adicionarCiclo(ciclo) {
  try {
    const usuario = obterUsuarioLogado();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(ABAS.CICLOS);
    
    aba.appendRow([
      ciclo.id, usuario.email, ciclo.idPlanejamento, ciclo.dataInicio,
      ciclo.dataFim || '', ciclo.status || 'ativo', ciclo.dadosJSON || '{}', new Date()
    ]);
    
    formatarUltimaLinha(aba);
    return true;
  } catch (e) {
    Logger.log('Erro em adicionarCiclo: ' + e);
    throw e;
  }
}

function atualizarGasto(gasto) {
  try {
    const usuario = obterUsuarioLogado();
    return atualizarLinhaComUsuario(
      ABAS.GASTOS, gasto.id, usuario.email,
      [gasto.id, usuario.email, gasto.data, gasto.descricao, gasto.valor,
       gasto.categoria, gasto.observacoes, gasto.pago, gasto.idPlanejamento || '']
    );
  } catch (e) {
    Logger.log('Erro em atualizarGasto: ' + e);
    throw e;
  }
}

function atualizarRenda(renda) {
  try {
    const usuario = obterUsuarioLogado();
    return atualizarLinhaComUsuario(
      ABAS.RENDAS, renda.id, usuario.email,
      [renda.id, usuario.email, renda.data, renda.descricao, renda.valor,
       renda.recorrente, renda.idPlanejamento || '']
    );
  } catch (e) {
    Logger.log('Erro em atualizarRenda: ' + e);
    throw e;
  }
}

function atualizarFixo(fixo) {
  try {
    const usuario = obterUsuarioLogado();
    return atualizarLinhaComUsuario(
      ABAS.FIXOS, fixo.id, usuario.email,
      [fixo.id, usuario.email, fixo.descricao, fixo.valor,
       fixo.diaVencimento, fixo.categoria, fixo.ativo]
    );
  } catch (e) {
    Logger.log('Erro em atualizarFixo: ' + e);
    throw e;
  }
}

function atualizarMeta(meta) {
  try {
    const usuario = obterUsuarioLogado();
    return atualizarLinhaComUsuario(
      ABAS.METAS, meta.id, usuario.email,
      [meta.id, usuario.email, meta.nome, meta.valorTotal,
       meta.valorAtual, meta.dataObjetivo || '', meta.ativa !== false]
    );
  } catch (e) {
    Logger.log('Erro em atualizarMeta: ' + e);
    throw e;
  }
}

function atualizarParcelado(parc) {
  try {
    const usuario = obterUsuarioLogado();
    return atualizarLinhaComUsuario(
      ABAS.PARCELADOS, parc.id, usuario.email,
      [parc.id, usuario.email, parc.descricao, parc.valorTotal,
       parc.parcelas, parc.parcelasPagas || 0, parc.dataInicio]
    );
  } catch (e) {
    Logger.log('Erro em atualizarParcelado: ' + e);
    throw e;
  }
}

function atualizarPlanejamento(plan) {
  try {
    const usuario = obterUsuarioLogado();
return atualizarLinhaComUsuario(
ABAS.PLANEJAMENTOS, plan.id, usuario.email,
[plan.id, usuario.email, plan.nome, plan.saldoInicial,
plan.dataInicio, plan.dataFim, plan.ativo, plan.dadosJSON || '{}']
);
} catch (e) {
Logger.log('Erro em atualizarPlanejamento: ' + e);
throw e;
}
}
function atualizarCiclo(ciclo) {
try {
const usuario = obterUsuarioLogado();
return atualizarLinhaComUsuario(
ABAS.CICLOS, ciclo.id, usuario.email,
[ciclo.id, usuario.email, ciclo.idPlanejamento, ciclo.dataInicio,
ciclo.dataFim || '', ciclo.status, ciclo.dadosJSON || '{}']
);
} catch (e) {
Logger.log('Erro em atualizarCiclo: ' + e);
throw e;
}
}
function atualizarLinhaComUsuario(nomeAba, id, emailUsuario, valores) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(nomeAba);
    const dados = aba.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(id) && 
          String(dados[i][1]).toLowerCase() === emailUsuario.toLowerCase()) {
        
        const numCols = aba.getLastColumn();
        
        // ✅ Se valores não incluir a última coluna (data cadastro), adicionar
        if (valores.length === numCols - 1) {
          valores.push(dados[i][numCols - 1]); // Preservar data de cadastro
        }
        
        if (valores.length !== numCols) {
          Logger.log(`❌ Erro: esperado ${numCols} colunas, recebido ${valores.length}`);
          Logger.log(`Dados recebidos: ${JSON.stringify(valores)}`);
          throw new Error(`Número de colunas inválido: esperado ${numCols}, recebido ${valores.length}`);
        }
        
        aba.getRange(i + 1, 1, 1, valores.length).setValues([valores]);
        Logger.log(`✅ ${nomeAba} atualizado: ${id}`);
        return true;
      }
    }
    
    Logger.log(`⚠️ Item não encontrado: ${id}`);
    return false;
  } catch (e) {
    Logger.log(`❌ Erro em atualizarLinhaComUsuario: ${e}`);
    throw e;
  }
}
function excluirGasto(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.GASTOS, id, usuario.email);
}
function excluirRenda(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.RENDAS, id, usuario.email);
}
function excluirFixo(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.FIXOS, id, usuario.email);
}
function excluirMeta(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.METAS, id, usuario.email);
}
function excluirParcelado(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.PARCELADOS, id, usuario.email);
}
function excluirPlanejamento(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.PLANEJAMENTOS, id, usuario.email);
}
function excluirCiclo(id) {
const usuario = obterUsuarioLogado();
return excluirLinhaComUsuario(ABAS.CICLOS, id, usuario.email);
}
function excluirLinhaComUsuario(nomeAba, id, emailUsuario) {
try {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const aba = ss.getSheetByName(nomeAba);
const dados = aba.getDataRange().getValues();
for (let i = 1; i < dados.length; i++) {
  if (String(dados[i][0]) === String(id) && 
      String(dados[i][1]).toLowerCase() === emailUsuario.toLowerCase()) {
    aba.deleteRow(i + 1);
    return true;
  }
}
return false;
} catch (e) {
Logger.log('Erro em excluirLinhaComUsuario: ' + e);
throw e;
}
}
function formatarUltimaLinha(aba) {
try {
const ultimaLinha = aba.getLastRow();
const range = aba.getRange(ultimaLinha, 1, 1, aba.getLastColumn());
if (ultimaLinha % 2 === 0) {
range.setBackground('#f8f9fa');
}
} catch (e) {
Logger.log('Erro em formatarUltimaLinha: ' + e);
}
}
function formatarDataISO(data) {
    try {
        if (!data) return '';
        
        // ✅ Validar formato de string
        if (typeof data === 'string') {
            // Aceitar formatos: YYYY-MM-DD, DD/MM/YYYY
            if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
            
            // Converter DD/MM/YYYY para YYYY-MM-DD
            const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (match) {
                return `${match[3]}-${match[2]}-${match[1]}`;
            }
            
            // Tentar parsear
            const parsed = new Date(data);
            if (!isNaN(parsed.getTime())) {
                const ano = parsed.getFullYear();
                const mes = String(parsed.getMonth() + 1).padStart(2, '0');
                const dia = String(parsed.getDate()).padStart(2, '0');
                return `${ano}-${mes}-${dia}`;
            }
            
            Logger.log(`⚠️ Data inválida: ${data}`);
            return '';
        }
        
        // ✅ Converter objeto Date
        const d = new Date(data);
        if (isNaN(d.getTime())) {
            Logger.log(`⚠️ Data inválida: ${data}`);
            return '';
        }
        
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    } catch (e) {
        Logger.log(`❌ Erro ao formatar data: ${e}`);
        return '';
    }
}
function gerarId() {
return Utilities.getUuid();
}
function calcularFluxoDiario(monthKey, items, saldoInicial) {
  try {
    // Extrair ano e mês do monthKey (formato: "2025-01")
    const [ano, mes] = monthKey.split('-').map(Number);
    
    // Descobrir quantos dias tem o mês
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
    if (items.rendas) {
      items.rendas.forEach(renda => {
        if (renda.incluido === false) return;
        
        const valor = renda.valorEditado !== undefined ? renda.valorEditado : renda.valor;
        
        if (renda.recorrente) {
          // Renda recorrente - usar dia da data original
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
          // Renda avulsa - verificar se é deste mês
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
    }
    
    // Processar FIXOS
    if (items.fixos) {
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
    }
    
    // Processar GASTOS
    if (items.gastos) {
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
    }
    
    // Processar PARCELADOS
    if (items.parcelados) {
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
    }
    
    // Processar METAS
    if (items.metas) {
      items.metas.forEach(meta => {
        if (meta.incluido === false) return;
        
        const valorMensal = meta.valorEditado !== undefined ? meta.valorEditado : meta.valorMensal;
        
        // Metas sempre no último dia do mês
        if (dias[ultimoDia - 1]) {
          dias[ultimoDia - 1].saidas.push({
            descricao: `Meta: ${meta.nome}`,
            valor: valorMensal,
            tipo: 'meta'
          });
        }
      });
    }
    
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
    
  } catch (e) {
    Logger.log('Erro em calcularFluxoDiario: ' + e);
    return [];
  }
}
