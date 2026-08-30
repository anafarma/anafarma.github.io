/* ANA FARMA DEV — RESPONSIVE PHARMACY VISUAL LANGUAGE
 * Presentation-only layer. No API/auth/storage/business logic.
 */
(function(){'use strict';
const ID='ana-pharmacy-responsive-ui';
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
:root{--af-ink:#17322f;--af-teal:#087f73;--af-teal2:#0b6b62;--af-mint:#dff3ee;--af-paper:#fbfaf6;--af-line:#d8e3df;--af-orange:#d46b2c;--af-purple:#6658a6;--af-yellow:#e5ad35}
html,body{font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;background:var(--af-paper)!important;color:var(--af-ink)!important}
h1,h2,h3,h4,.ana-page-title,.menu-label,.stat-value{font-family:'Plus Jakarta Sans','Manrope',sans-serif!important}
/* Human visual language: warm paper, ink, botanical teal, restrained accent colors. */
.card,.stat-card,.list-item,.menu-item,table{border-color:var(--af-line)!important;background:#fffdf9!important}
.card,.stat-card,.list-item,.menu-item{border-radius:10px!important}
.menu-grid{gap:11px!important}.menu-item{position:relative;overflow:hidden;min-height:86px!important;display:flex!important;align-items:center!important;gap:11px!important;text-align:left!important;padding:13px!important}
.menu-item::after{content:'';position:absolute;right:-18px;bottom:-22px;width:58px;height:58px;border:1px solid #d9e8e3;border-radius:50%;opacity:.8}
.menu-icon{width:40px;height:40px!important;display:grid;place-items:center;border-radius:11px;background:var(--af-mint);font-size:22px!important;line-height:1;flex:none;transition:transform .16s ease,background .16s ease}.menu-item:hover .menu-icon{transform:translateY(-2px) rotate(-3deg);background:#ccece5}
.menu-item-unggulan{background:var(--af-teal)!important;color:white!important;border-color:var(--af-teal)!important}.menu-item-unggulan .menu-icon{background:rgba(255,255,255,.16)!important;color:#fff}.menu-item-unggulan::after{border-color:rgba(255,255,255,.2)}
/* Replace the generic monochrome glyph feel with contextual, lively glyph containers. */
[data-screen='dashboard'] .menu-item:nth-child(1) .menu-icon{background:#dff3ee}.menu-item:nth-child(2) .menu-icon{background:#fff0df}.menu-item:nth-child(3) .menu-icon{background:#ebe7fb}.menu-item:nth-child(4) .menu-icon{background:#e4f0fb}.menu-item:nth-child(5) .menu-icon{background:#f8e8df}
.ana-page-head{border-bottom:1px solid var(--af-line)!important}.ana-page-title{letter-spacing:-.035em!important}.ana-page-desc{max-width:680px}
.ana-kpi-strip{gap:10px!important}.ana-kpi{border-radius:9px!important;position:relative;overflow:hidden}.ana-kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--af-teal)}
.btn{border-radius:7px!important}.btn-primary{background:var(--af-teal)!important}.btn-primary:hover{background:var(--af-teal2)!important}
.form-group input,.form-group select,.form-group textarea,.search-bar{background:#fffdf9!important;border-radius:7px!important}
thead th{background:#eef4f1!important;color:#49615d!important}
/* responsive tables: preserve scanability instead of shrinking text to illegibility */
@media(max-width:699px){
 body{font-size:14px!important}.container{padding:14px 12px calc(82px + env(safe-area-inset-bottom))!important}
 #dev-app-topbar{padding-left:12px!important;padding-right:12px!important}.dev-brand-emblem{width:34px!important;height:34px!important}
 .ana-page-title{font-size:20px!important}.ana-page-desc{font-size:11.5px!important}
 .ana-kpi{padding:10px!important}.ana-kpi-value{font-size:17px!important}
 .grid-2,.grid-3{grid-template-columns:1fr!important}
 .menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}.menu-item{min-height:78px!important;padding:10px!important;gap:8px!important}.menu-icon{width:35px;height:35px!important;font-size:19px!important;border-radius:9px}.menu-label{font-size:11px!important;line-height:1.25!important}
 .menu-item-unggulan{grid-column:1/-1!important;min-height:62px!important}.menu-item-unggulan .menu-label{font-size:13px!important}
 table{min-width:0!important;border:0!important;background:transparent!important}.ana-table-wrap{overflow:visible!important}
 table thead{display:none!important}table tbody,table tr,table td{display:block!important;width:100%!important}table tbody tr{background:#fffdf9!important;border:1px solid var(--af-line)!important;border-radius:9px!important;margin-bottom:8px!important;padding:8px!important}table tbody td{border:0!important;padding:4px 5px!important;font-size:12px!important}table tbody td::before{content:attr(data-label);display:inline-block;width:38%;font-size:10px;font-weight:800;color:#778784;text-transform:uppercase;letter-spacing:.04em;margin-right:5px}
 .modal-sheet,.modal-center{width:100%!important;max-width:100%!important}.modal-sheet{border-radius:14px 14px 0 0!important;max-height:94dvh!important}
 .ana-command{padding:7vh 10px!important}.ana-command-box{border-radius:12px!important}.ana-command-list{max-height:62dvh!important}
 .toast{max-width:calc(100vw - 24px)!important}
}
@media(min-width:700px) and (max-width:1099px){.menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.container{padding-left:22px!important;padding-right:22px!important}}
@media(min-width:1100px){.menu-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
@media(prefers-reduced-motion:reduce){.menu-icon{transition:none!important}}
`;
function install(){if(document.getElementById(ID))return;const s=document.createElement('style');s.id=ID;s.textContent=CSS;document.head.appendChild(s)}
function tableLabels(){document.querySelectorAll('table').forEach(t=>{const hs=[...t.querySelectorAll('thead th')].map(x=>x.textContent.trim());t.querySelectorAll('tbody tr').forEach(r=>[...r.children].forEach((c,i)=>{if(hs[i]&&!c.hasAttribute('data-label'))c.setAttribute('data-label',hs[i])}))})}
function init(){install();tableLabels();new MutationObserver(tableLabels).observe(document.body,{subtree:true,childList:true});window.__ANA_FARMA_DEV_RESPONSIVE_UI__='2026-08-31.1'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();