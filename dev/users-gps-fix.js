/*
 * APOTEK ANA FARMA — DEV USER MANAGEMENT / GPS FIX
 * 2026-08-29
 *
 * Replaces the previous users renderer that accidentally INVOKED toggleGps()
 * while binding buttons. The old pattern was:
 *   forEach(b => toggleGps(...))
 * which executed immediately on every render, causing GPS TRUE/FALSE to flip
 * repeatedly and recursively reloading the users screen.
 *
 * This module owns the users screen UI and binds real click handlers only.
 */
(function () {
  'use strict';

  const READY = '__ANA_FARMA_DEV_USERS_GPS_FIX__';
  if (window[READY]) return;
  window[READY] = true;

  const esc = v => typeof window.escapeHtml === 'function'
    ? window.escapeHtml(v)
    : String(v ?? '').replace(/[&<>\"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
      }[c]));

  const owner = () => String(window.AppState?.user?.role || '').trim().toLowerCase() === 'owner';
  const online = () => !!window.AppState?.isOnline;
  const toast = (m, t = 'info') => window.toast?.(m, t);

  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function field(id, label, value = '', type = 'text', extra = '') {
    return `<div class="form-group"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${extra}></div>`;
  }

  function select(id, label, options, value = '') {
    return `<div class="form-group"><label for="${esc(id)}">${esc(label)}</label><select id="${esc(id)}">${options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  }

  function modal(title, body, mount) {
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML = `<div class="modal-overlay center-align" data-users-fix-modal>
      <div class="modal-sheet modal-center" style="width:min(100%,560px)">
        <div class="modal-header"><h3>${esc(title)}</h3><button type="button" class="modal-close" id="users-fix-close">×</button></div>
        <div class="modal-body">${body}</div>
      </div>
    </div>`;
    const overlay = root.querySelector('[data-users-fix-modal]');
    root.querySelector('#users-fix-close').onclick = closeModal;
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
    mount?.(root);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  async function getUsersFresh() {
    const data = await window.apiGet('getUsers', {}, { cache: false });
    return Array.isArray(data) ? data : [];
  }

  async function gpsToggle(user) {
    if (!user || !owner()) return;
    if (!online()) {
      toast('Perubahan GPS membutuhkan koneksi internet.', 'warn');
      return;
    }

    const users = await getUsersFresh();
    const target = users.find(x => String(x.idUser) === String(user.idUser));
    if (!target) {
      toast('Data pengguna sudah berubah. Muat ulang halaman.', 'warn');
      return;
    }

    const buttons = document.querySelectorAll('[data-users-fix-gps]');
    buttons.forEach(b => { b.disabled = true; b.setAttribute('aria-busy', 'true'); });

    try {
      await window.apiPost('toggleGPSUser', {
        idUser: window.AppState.user.idUser,
        targetUserId: target.idUser,
        wajibGPS: !Boolean(target.wajibGPS)
      });
      toast(`GPS ${target.nama || target.username} sekarang ${target.wajibGPS ? 'tidak wajib' : 'wajib'}.`, 'success');
      await renderUsers();
    } catch (e) {
      window.tampilkanError?.(e);
    } finally {
      buttons.forEach(b => { b.disabled = false; b.removeAttribute('aria-busy'); });
    }
  }

  function userModal(user) {
    if (!owner() || !online()) {
      if (!online()) toast('Perubahan pengguna membutuhkan koneksi internet.', 'warn');
      return;
    }

    const editing = !!user;
    modal(editing ? 'Edit Pengguna' : 'Pengguna Baru',
      `${field('uf-user', 'Username', editing ? user.username : '')}` +
      `${field('uf-nama', 'Nama', editing ? user.nama : '')}` +
      `${select('uf-role', 'Role', [{value:'Pegawai',label:'Pegawai'},{value:'Owner',label:'Owner'}], editing ? user.role : 'Pegawai')}` +
      `${editing ? '' : field('uf-pass', 'Password Awal', '12345678', 'password')}` +
      `<div class="form-group"><label><input id="uf-aktif" type="checkbox" ${!editing || user.aktif ? 'checked' : ''}> Aktif</label></div>` +
      `<div class="btn-row"><button class="btn btn-secondary" id="uf-cancel">Batal</button><button class="btn btn-primary" id="uf-save">Simpan</button></div>` +
      `${editing ? '<button class="btn btn-outline" id="uf-reset" style="margin-top:8px;">Reset Password</button>' : ''}`,
      root => {
        root.querySelector('#uf-cancel').onclick = closeModal;
        root.querySelector('#uf-save').onclick = async () => {
          const data = {
            idUser: window.AppState.user.idUser,
            nama: root.querySelector('#uf-nama').value.trim(),
            role: root.querySelector('#uf-role').value,
            aktif: root.querySelector('#uf-aktif').checked
          };
          if (!data.nama) { toast('Nama wajib diisi.', 'warn'); return; }

          if (editing) {
            data.idUser = user.idUser;
          } else {
            data.username = root.querySelector('#uf-user').value.trim();
            data.password = root.querySelector('#uf-pass').value;
            if (!data.username || !data.password) { toast('Username dan password wajib diisi.', 'warn'); return; }
          }

          const b = root.querySelector('#uf-save');
          b.disabled = true;
          try {
            await window.apiPost(editing ? 'updateUser' : 'addUser', data);
            closeModal();
            await renderUsers();
            toast(editing ? 'Data pengguna diperbarui.' : 'Pengguna baru berhasil ditambahkan.', 'success');
          } catch (e) {
            window.tampilkanError?.(e);
            b.disabled = false;
          }
        };

        const reset = root.querySelector('#uf-reset');
        if (reset) reset.onclick = async () => {
          const pass = window.prompt('Password baru:', '12345678');
          if (!pass) return;
          try {
            await window.apiPost('resetPasswordUser', {
              idUser: window.AppState.user.idUser,
              targetUserId: user.idUser,
              passwordBaru: pass
            });
            toast('Password pengguna berhasil direset.', 'success');
          } catch (e) {
            window.tampilkanError?.(e);
          }
        };
      }
    );
  }

  async function renderUsers(root) {
    if (!owner()) {
      root.innerHTML = '<div class="container"><div class="empty-state">Modul ini hanya dapat diakses Owner.</div></div>';
      return;
    }

    root.innerHTML = '<div class="container"><div class="empty-state">Memuat pengguna...</div></div>';

    try {
      const rows = await getUsersFresh();
      root.innerHTML = `<div class="container">
        <div class="section-title">Pengguna</div>
        <button class="btn btn-primary" id="users-fix-add">+ Pengguna</button>
        <div id="users-fix-list" style="margin-top:10px;"></div>
      </div>`;

      const list = root.querySelector('#users-fix-list');
      list.innerHTML = rows.map(u => `<div class="list-item">
        <div class="li-main">
          <div class="li-title">${esc(u.nama)} • ${esc(u.username)}</div>
          <div class="li-sub">${esc(u.role)} • ${u.wajibGPS ? 'GPS wajib' : 'GPS tidak wajib'}</div>
        </div>
        <div class="li-right">
          <span class="pill ${u.aktif ? 'pill-success' : 'pill-danger'}">${u.aktif ? 'Aktif' : 'Nonaktif'}</span>
          <div style="display:flex;gap:4px;margin-top:5px;">
            <button type="button" class="btn btn-outline btn-sm" data-users-fix-edit="${esc(u.idUser)}">Edit</button>
            <button type="button" class="btn btn-outline btn-sm" data-users-fix-gps="${esc(u.idUser)}">GPS</button>
          </div>
        </div>
      </div>`).join('') || '<div class="empty-state">Belum ada pengguna.</div>';

      root.querySelector('#users-fix-add').onclick = () => userModal(null);
      list.querySelectorAll('[data-users-fix-edit]').forEach(button => {
        button.onclick = () => userModal(rows.find(x => String(x.idUser) === String(button.dataset.usersFixEdit)));
      });
      list.querySelectorAll('[data-users-fix-gps]').forEach(button => {
        button.onclick = () => gpsToggle(rows.find(x => String(x.idUser) === String(button.dataset.usersFixGps)));
      });
    } catch (e) {
      root.innerHTML = `<div class="container"><div class="empty-state">Gagal memuat pengguna.<br><small>${esc(e?.message || e)}</small></div></div>`;
    }
  }

  function install() {
    if (!window.SCREEN_RENDERERS || typeof window.apiGet !== 'function' || typeof window.apiPost !== 'function') {
      setTimeout(install, 50);
      return;
    }
    window.SCREEN_RENDERERS.users = renderUsers;
    console.info('[DEV USERS GPS FIX] installed — click-only GPS mutation');
  }

  install();
})();
