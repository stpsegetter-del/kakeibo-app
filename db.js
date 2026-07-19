/*
 * db.js
 * かんたん家計簿 - IndexedDB アクセス層
 * React本体からは window.KakeiboDB / window.KakeiboSeed / window.uuid を利用する。
 * JSXを含まないプレーンJSなので Babel の変換対象外（<script> で普通に読み込む）。
 */
(function (global) {
  'use strict';

  var DB_NAME = 'kakeiboDB';
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('transactions')) {
          var txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('type', 'type', { unique: false });
          txStore.createIndex('majorCategoryId', 'majorCategoryId', { unique: false });
          txStore.createIndex('recurringId', 'recurringId', { unique: false });
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recurringRules')) {
          db.createObjectStore('recurringRules', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function getStore(storeName, mode) {
    var db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  var KakeiboDB = {
    async getAll(storeName) {
      var store = await getStore(storeName, 'readonly');
      return reqToPromise(store.getAll());
    },
    async get(storeName, key) {
      var store = await getStore(storeName, 'readonly');
      return reqToPromise(store.get(key));
    },
    async put(storeName, value) {
      var store = await getStore(storeName, 'readwrite');
      return reqToPromise(store.put(value));
    },
    async bulkPut(storeName, values) {
      if (!values || !values.length) return;
      var db = await openDB();
      var tx = db.transaction(storeName, 'readwrite');
      var store = tx.objectStore(storeName);
      values.forEach(function (v) { store.put(v); });
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    },
    async delete(storeName, key) {
      var store = await getStore(storeName, 'readwrite');
      return reqToPromise(store.delete(key));
    },
    async clear(storeName) {
      var store = await getStore(storeName, 'readwrite');
      return reqToPromise(store.clear());
    },
    async clearAll() {
      var stores = ['transactions', 'categories', 'recurringRules', 'budgets', 'settings'];
      for (var i = 0; i < stores.length; i++) {
        await this.clear(stores[i]);
      }
    },
    async exportAll() {
      var data = {};
      var stores = ['transactions', 'categories', 'recurringRules', 'budgets', 'settings'];
      for (var i = 0; i < stores.length; i++) {
        data[stores[i]] = await this.getAll(stores[i]);
      }
      return {
        appName: 'kakeibo-app',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: data
      };
    },
    async importAll(payload, mode) {
      // mode: 'replace' | 'merge'
      if (!payload || !payload.data) throw new Error('不正なバックアップファイルです');
      var stores = ['transactions', 'categories', 'recurringRules', 'budgets', 'settings'];
      if (mode === 'replace') {
        await this.clearAll();
      }
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var items = payload.data[s];
        if (Array.isArray(items) && items.length) {
          if (mode === 'merge') {
            var existing = await this.getAll(s);
            var existingKeys = {};
            var keyField = s === 'settings' ? 'key' : 'id';
            existing.forEach(function (it) { existingKeys[it[keyField]] = true; });
            items = items.filter(function (it) { return !existingKeys[it[keyField]]; });
          }
          await this.bulkPut(s, items);
        }
      }
    }
  };

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---- 初期データ（デフォルトカテゴリ） ----
  var DEFAULT_EXPENSE_CATEGORIES = [
    { name: '食費', icon: '🍚', color: '#FF9F43', subs: ['外食', '自炊・食材', 'カフェ・軽食'] },
    { name: '日用品', icon: '🧻', color: '#F6C453', subs: ['消耗品', '衣類・美容'] },
    { name: '交通費', icon: '🚃', color: '#4DA3FF', subs: ['電車・バス', 'タクシー', 'ガソリン'] },
    { name: '住居費', icon: '🏠', color: '#8C7AE6', subs: ['家賃', '修繕・設備'] },
    { name: '光熱費', icon: '💡', color: '#FFD23F', subs: ['電気', 'ガス', '水道'] },
    { name: '通信費', icon: '📱', color: '#3EC6C6', subs: ['携帯電話', 'インターネット'] },
    { name: '交際費', icon: '🎉', color: '#FF6F91', subs: ['飲み会', 'プレゼント'] },
    { name: '趣味・娯楽', icon: '🎮', color: '#9B6BFF', subs: ['趣味', '旅行', '書籍・雑誌'] },
    { name: '医療費', icon: '🏥', color: '#5FD08E', subs: ['通院', '薬・市販薬'] },
    { name: '教育', icon: '📚', color: '#4D96FF', subs: ['書籍・教材', '習い事'] },
    { name: '保険', icon: '🛡️', color: '#6C7A89', subs: ['生命保険', '自動車保険'] },
    { name: 'その他', icon: '📦', color: '#B0B7C3', subs: ['雑費'] }
  ];
  var DEFAULT_INCOME_CATEGORIES = [
    { name: '給与', icon: '💰', color: '#FFA732', subs: ['本業', '副業'] },
    { name: 'ボーナス', icon: '🎁', color: '#FFC94D', subs: [] },
    { name: 'お小遣い', icon: '👛', color: '#FF9F43', subs: [] },
    { name: 'その他収入', icon: '✨', color: '#F6C453', subs: [] }
  ];

  function buildDefaultCategories() {
    var list = [];
    var order = 0;
    [['expense', DEFAULT_EXPENSE_CATEGORIES], ['income', DEFAULT_INCOME_CATEGORIES]].forEach(function (pair) {
      var type = pair[0], defs = pair[1];
      defs.forEach(function (def) {
        list.push({
          id: uuid(),
          type: type,
          name: def.name,
          icon: def.icon,
          color: def.color,
          order: order++,
          isDefault: true,
          subcategories: def.subs.map(function (subName) {
            return { id: uuid(), name: subName };
          })
        });
      });
    });
    return list;
  }

  async function seedIfNeeded() {
    var seededFlag = await KakeiboDB.get('settings', 'seeded');
    if (seededFlag && seededFlag.value) return;
    var cats = buildDefaultCategories();
    await KakeiboDB.bulkPut('categories', cats);
    await KakeiboDB.put('settings', { key: 'seeded', value: true });
  }

  global.KakeiboDB = KakeiboDB;
  global.uuid = uuid;
  global.KakeiboSeed = { seedIfNeeded: seedIfNeeded };
})(window);
