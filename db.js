/**
 * DB.js — Camada de dados da loja (Marcenaria)
 * ------------------------------------------------------------
 * Todo acesso a dados do sistema passa por aqui. Hoje ele usa
 * localStorage, mas TODAS as funções são assíncronas (retornam
 * Promise) de propósito: quando você migrar para MySQL + uma
 * API em Node.js, basta trocar o "motor" no final deste arquivo
 * (bloco ENGINE) por chamadas fetch('/api/...') — o resto do
 * site (admin.html e loja.html) não precisa mudar em nada,
 * porque eles só chamam DB.produtos.listar(), DB.pedidos.criar()
 * etc.
 *
 * Ver /sql/schema.sql para o desenho das tabelas equivalentes.
 * ------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var STORE_ID = 'default'; // preparado para futura multiloja (prefixo de chaves)

  function key(name) {
    return STORE_ID + '::' + name;
  }

  // -----------------------------------------------------------
  // Motor de armazenamento (hoje: localStorage). Troque aqui.
  // -----------------------------------------------------------
  var engine = {
    get: function (name, fallback) {
      try {
        var raw = localStorage.getItem(key(name));
        // Compatibilidade: dados antigos gravados sem prefixo
        if (raw === null) raw = localStorage.getItem(name);
        return raw !== null ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.error('DB.get error', name, e);
        return fallback;
      }
    },
    set: function (name, value) {
      try {
        localStorage.setItem(key(name), JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('DB.set error', name, e);
        return false;
      }
    }
  };

  function resolved(value) {
    return Promise.resolve(value);
  }

  // -----------------------------------------------------------
  // Utilitários
  // -----------------------------------------------------------
  function uid() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  function nextOrderCode(orders) {
    var year = new Date().getFullYear();
    var seq = orders.filter(function (o) {
      return o.code && o.code.indexOf('MRC-' + year) === 0;
    }).length + 1;
    return 'MRC-' + year + '-' + pad(seq, 4);
  }

  async function sha256(text) {
    if (global.crypto && global.crypto.subtle) {
      var enc = new TextEncoder().encode(text);
      var buf = await global.crypto.subtle.digest('SHA-256', enc);
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return ('00' + b.toString(16)).slice(-2); })
        .join('');
    }
    // Fallback bem simples (navegadores muito antigos / sem HTTPS)
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return 'fallback_' + hash;
  }

  function log(action, details) {
    var logs = engine.get('activityLog', []);
    logs.push({ id: uid(), action: action, details: details || '', date: new Date().toISOString() });
    if (logs.length > 500) logs = logs.slice(-500); // limita tamanho
    engine.set('activityLog', logs);
  }

  // =============================================================
  // CONFIG DA LOJA
  // =============================================================
  var Config = {
    DEFAULT: {
      name: 'MARCENARIA',
      tagline: 'Móveis planejados e sob medida',
      phone: '',
      whatsapp: '',
      email: '',
      pix: '',
      address: '',
      bannerText: '',
      instagram: ''
    },
    get: function () {
      return resolved(Object.assign({}, Config.DEFAULT, engine.get('config', {})));
    },
    save: function (cfg) {
      engine.set('config', cfg);
      log('config.save', 'Configurações atualizadas');
      return resolved(cfg);
    }
  };

  // =============================================================
  // PRODUTOS
  // Campos extras de marcenaria: material, dimensoes, sobEncomenda,
  // prazoDias, estoque
  // =============================================================
  var Products = {
    list: function () {
      return resolved(engine.get('products', []));
    },
    listActive: function () {
      return Products.list().then(function (list) {
        return list.filter(function (p) { return p.status === 'active'; });
      });
    },
    get: function (id) {
      return Products.list().then(function (list) {
        return list.find(function (p) { return p.id === id; }) || null;
      });
    },
    save: function (p) {
      return Products.list().then(function (list) {
        if (!p.id) p.id = uid();
        var idx = list.findIndex(function (x) { return x.id === p.id; });
        if (idx !== -1) list[idx] = p; else list.push(p);
        engine.set('products', list);
        log('product.save', p.name);
        return p;
      });
    },
    remove: function (id) {
      return Products.list().then(function (list) {
        var target = list.find(function (p) { return p.id === id; });
        list = list.filter(function (p) { return p.id !== id; });
        engine.set('products', list);
        log('product.delete', target ? target.name : id);
        return true;
      });
    },
    adjustStock: function (id, delta) {
      return Products.list().then(function (list) {
        var p = list.find(function (x) { return x.id === id; });
        if (p && typeof p.stock === 'number') {
          p.stock = Math.max(0, p.stock + delta);
          engine.set('products', list);
        }
        return p;
      });
    }
  };

  // =============================================================
  // CATEGORIAS
  // =============================================================
  var Categories = {
    list: function () {
      return resolved(engine.get('categories', ['Cozinhas', 'Guarda-Roupas', 'Painéis TV', 'Escritório', 'Sob Medida']));
    },
    save: function (list) {
      engine.set('categories', list);
      log('categories.save', list.join(', '));
      return resolved(list);
    }
  };

  // =============================================================
  // CUPONS
  // =============================================================
  var Coupons = {
    list: function () {
      return resolved(engine.get('coupons', []));
    },
    save: function (c) {
      return Coupons.list().then(function (list) {
        if (!c.id) c.id = uid();
        var idx = list.findIndex(function (x) { return x.id === c.id; });
        if (idx !== -1) list[idx] = c; else list.push(c);
        engine.set('coupons', list);
        log('coupon.save', c.code);
        return c;
      });
    },
    remove: function (id) {
      return Coupons.list().then(function (list) {
        list = list.filter(function (c) { return c.id !== id; });
        engine.set('coupons', list);
        return true;
      });
    },
    validate: function (code) {
      return Coupons.list().then(function (list) {
        var coupon = list.find(function (c) { return c.code === code; });
        if (!coupon) return { ok: false, reason: 'Cupom inválido' };
        if (coupon.expiry && new Date() > new Date(coupon.expiry)) return { ok: false, reason: 'Cupom expirado' };
        if (typeof coupon.uses === 'number' && coupon.uses <= 0) return { ok: false, reason: 'Cupom esgotado' };
        return { ok: true, coupon: coupon };
      });
    },
    consume: function (code) {
      return Coupons.list().then(function (list) {
        var idx = list.findIndex(function (c) { return c.code === code; });
        if (idx !== -1 && typeof list[idx].uses === 'number') {
          list[idx].uses = Math.max(0, list[idx].uses - 1);
          engine.set('coupons', list);
        }
      });
    }
  };

  // =============================================================
  // PEDIDOS (ORDERS) — com fluxo de status para marcenaria
  // pending -> confirmed -> in_production -> ready -> delivered
  // (ou cancelled em qualquer ponto)
  // =============================================================
  var ORDER_STATUSES = ['pending', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled'];
  var ORDER_STATUS_LABELS = {
    pending: 'Aguardando confirmação',
    confirmed: 'Confirmado',
    in_production: 'Em produção',
    ready: 'Pronto para entrega/retirada',
    delivered: 'Entregue',
    cancelled: 'Cancelado'
  };

  var Orders = {
    STATUSES: ORDER_STATUSES,
    STATUS_LABELS: ORDER_STATUS_LABELS,
    list: function () {
      return resolved(engine.get('orders', []));
    },
    create: function (order) {
      return Orders.list().then(function (list) {
        order.id = uid();
        order.code = nextOrderCode(list);
        order.status = 'pending';
        order.statusHistory = [{ status: 'pending', date: new Date().toISOString() }];
        order.date = new Date().toISOString();
        list.push(order);
        engine.set('orders', list);
        log('order.create', order.code);
        return order;
      });
    },
    updateStatus: function (id, status) {
      return Orders.list().then(function (list) {
        var o = list.find(function (x) { return x.id === id; });
        if (o) {
          o.status = status;
          o.statusHistory = o.statusHistory || [];
          o.statusHistory.push({ status: status, date: new Date().toISOString() });
          engine.set('orders', list);
          log('order.status', o.code + ' -> ' + status);
        }
        return o;
      });
    },
    findByCodeAndPhone: function (code, phone) {
      return Orders.list().then(function (list) {
        var digits = (phone || '').replace(/\D/g, '');
        return list.find(function (o) {
          var oDigits = (o.customerPhone || '').replace(/\D/g, '');
          return o.code && o.code.toUpperCase() === String(code).toUpperCase().trim() && oDigits.slice(-8) === digits.slice(-8);
        }) || null;
      });
    },
    stats: function (days) {
      return Orders.list().then(function (list) {
        var cutoff = days ? Date.now() - days * 86400000 : 0;
        var relevant = list.filter(function (o) { return new Date(o.date).getTime() >= cutoff && o.status !== 'cancelled'; });
        var revenue = relevant.reduce(function (sum, o) { return sum + (o.total || 0); }, 0);
        return { count: relevant.length, revenue: revenue };
      });
    }
  };

  // =============================================================
  // CHAT
  // =============================================================
  var Chat = {
    list: function () {
      return resolved(engine.get('chatMessages', []));
    },
    save: function (list) {
      engine.set('chatMessages', list);
      return resolved(list);
    },
    add: function (msg) {
      return Chat.list().then(function (list) {
        msg.id = uid();
        msg.date = new Date().toISOString();
        list.push(msg);
        engine.set('chatMessages', list);
        return msg;
      });
    }
  };

  // =============================================================
  // AUTENTICAÇÃO (admin) — hash de senha + tentativas + sessão
  // =============================================================
  var SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas
  var MAX_ATTEMPTS = 5;
  var LOCKOUT_MS = 60 * 1000; // 60s

  var Auth = {
    ensureDefault: async function () {
      var acc = engine.get('adminAccount', null);
      if (!acc) {
        var salt = uid().toString(36);
        var hash = await sha256('123' + salt);
        acc = { username: 'ferrera', passHash: hash, salt: salt };
        engine.set('adminAccount', acc);
      }
      return acc;
    },
    login: async function (username, password) {
      var attempts = engine.get('loginAttempts', { count: 0, lockUntil: 0 });
      if (attempts.lockUntil && Date.now() < attempts.lockUntil) {
        var secs = Math.ceil((attempts.lockUntil - Date.now()) / 1000);
        return { ok: false, reason: 'Muitas tentativas. Aguarde ' + secs + 's.' };
      }
      var acc = await Auth.ensureDefault();
      var hash = await sha256(password + acc.salt);
      if (username === acc.username && hash === acc.passHash) {
        engine.set('loginAttempts', { count: 0, lockUntil: 0 });
        var session = { username: username, loginTime: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
        sessionStorage.setItem('adminSession', JSON.stringify(session));
        log('auth.login', username);
        return { ok: true, session: session };
      }
      attempts.count = (attempts.count || 0) + 1;
      if (attempts.count >= MAX_ATTEMPTS) {
        attempts.lockUntil = Date.now() + LOCKOUT_MS;
        attempts.count = 0;
      }
      engine.set('loginAttempts', attempts);
      log('auth.failed', username);
      return { ok: false, reason: 'Usuário ou senha inválidos.' };
    },
    logout: function () {
      sessionStorage.removeItem('adminSession');
    },
    getSession: function () {
      try {
        var s = JSON.parse(sessionStorage.getItem('adminSession') || 'null');
        if (!s) return null;
        if (Date.now() > s.expiresAt) {
          sessionStorage.removeItem('adminSession');
          return null;
        }
        return s;
      } catch (e) {
        return null;
      }
    },
    changePassword: async function (currentPass, newPass) {
      var acc = await Auth.ensureDefault();
      var currentHash = await sha256(currentPass + acc.salt);
      if (currentHash !== acc.passHash) return { ok: false, reason: 'Senha atual incorreta' };
      var salt = uid().toString(36);
      acc.passHash = await sha256(newPass + salt);
      acc.salt = salt;
      engine.set('adminAccount', acc);
      log('auth.changePassword', acc.username);
      return { ok: true };
    },
    changeUsername: async function (currentPass, newUsername) {
      var acc = await Auth.ensureDefault();
      var currentHash = await sha256(currentPass + acc.salt);
      if (currentHash !== acc.passHash) return { ok: false, reason: 'Senha incorreta' };
      acc.username = newUsername;
      engine.set('adminAccount', acc);
      var session = Auth.getSession();
      if (session) {
        session.username = newUsername;
        sessionStorage.setItem('adminSession', JSON.stringify(session));
      }
      log('auth.changeUsername', newUsername);
      return { ok: true };
    }
  };

  // =============================================================
  // BACKUP / EXPORTAÇÃO (essencial em nível empresarial)
  // =============================================================
  var Backup = {
    exportJSON: function () {
      var data = {
        exportedAt: new Date().toISOString(),
        config: engine.get('config', {}),
        products: engine.get('products', []),
        categories: engine.get('categories', []),
        coupons: engine.get('coupons', []),
        orders: engine.get('orders', []),
        chatMessages: engine.get('chatMessages', [])
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'backup-loja-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      log('backup.export', '');
    },
    importJSON: function (jsonText) {
      try {
        var data = JSON.parse(jsonText);
        if (data.config) engine.set('config', data.config);
        if (data.products) engine.set('products', data.products);
        if (data.categories) engine.set('categories', data.categories);
        if (data.coupons) engine.set('coupons', data.coupons);
        if (data.orders) engine.set('orders', data.orders);
        if (data.chatMessages) engine.set('chatMessages', data.chatMessages);
        log('backup.import', '');
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'Arquivo inválido: ' + e.message };
      }
    },
    exportOrdersCSV: function () {
      var orders = engine.get('orders', []);
      var rows = [['Código', 'Data', 'Cliente', 'Telefone', 'Total', 'Pagamento', 'Entrega', 'Status']];
      orders.forEach(function (o) {
        rows.push([
          o.code || o.id,
          new Date(o.date).toLocaleString('pt-BR'),
          o.customerName || '',
          o.customerPhone || '',
          (o.total || 0).toFixed(2).replace('.', ','),
          o.payment || '',
          o.delivery || '',
          ORDER_STATUS_LABELS[o.status] || o.status || ''
        ]);
      });
      var csv = rows.map(function (r) {
        return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';');
      }).join('\n');
      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pedidos-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  global.DB = {
    Config: Config,
    Products: Products,
    Categories: Categories,
    Coupons: Coupons,
    Orders: Orders,
    Chat: Chat,
    Auth: Auth,
    Backup: Backup,
    getActivityLog: function () { return resolved(engine.get('activityLog', [])); }
  };
})(window);
