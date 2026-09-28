/**
 * Frontend Application Controller (script.js)
 * รวมระบบยื่นคำขอ ระบบตรวจสอบสถานะ และระบบขอยกเลิกการใช้งาน
 */

// ==========================================
// 1. Global Variables & State
// ==========================================
const AppState = {
  branches: [],
  stationsCache: new Map(), 
  selectedFiles: [], 
  isSubmitting: false,
};

const AppStateStatus = {
  rawCitizenId: '',
  isPasswordVisible: false,
  retrievedPassword: '',
  cancelRawCitizenId: '',
  cancelRequestIdToSubmit: ''
};

let captchaAnswer = ''; 
let isFetchingId = false; 

// ==========================================
// 💡 2. API Configuration
// ==========================================
const API = {
  call: async function(action, payload = null) {
      // 👇 เปลี่ยนเป็น Worker URL ของคุณ
      const WORKER_URL = 'https://sso-requests.new903900.workers.dev/'; 
      try {
          const response = await fetch(WORKER_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: action, payload: payload })
          });
          if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
          return await response.json();
      } catch (error) {
          throw new Error("การเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง กรุณาตรวจสอบ Network");
      }
  }
};

// ==========================================
// 3. Initialization & Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadInitialReferenceData(); 
  generateCaptcha(); 
});

function initEventListeners() {
  const ssoSelect = document.getElementById('ssoBranchCode');
  const stationSelect = document.getElementById('pollingStationId');
  const fileInput = document.getElementById('ndaFile');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const btnValidate = document.getElementById('btnValidate');
  const btnCancelPreview = document.getElementById('btnCancelPreview');
  const btnConfirmSubmit = document.getElementById('btnConfirmSubmit');
  const btnCopyRequestId = document.getElementById('btnCopyRequestId');
  const btnResetForm = document.getElementById('btnResetForm');
  
  const citizenInput = document.getElementById('citizenId');
  const phoneInput = document.getElementById('phone');
  const searchPhoneInput = document.getElementById('searchPhone');
  const cancelPhoneInput = document.getElementById('cancelPhone');
  
  if(citizenInput) citizenInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
  if(phoneInput) phoneInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
  if(searchPhoneInput) searchPhoneInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
  if(cancelPhoneInput) cancelPhoneInput.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));

  const searchCaptchaInput = document.getElementById('searchCaptcha');
  const cancelCaptchaInput = document.getElementById('cancelCaptcha');
  const enforceLowercase = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''); };
  if(searchCaptchaInput) searchCaptchaInput.addEventListener('input', enforceLowercase);
  if(cancelCaptchaInput) cancelCaptchaInput.addEventListener('input', enforceLowercase);

  const fNameEnInput = document.getElementById('firstnameEn');
  const lNameEnInput = document.getElementById('lastnameEn');
  const enforceLowercaseEng = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z\s]/g, ''); };
  if(fNameEnInput) fNameEnInput.addEventListener('input', enforceLowercaseEng);
  if(lNameEnInput) lNameEnInput.addEventListener('input', enforceLowercaseEng);

  if(ssoSelect) ssoSelect.addEventListener('change', (e) => handleBranchChange(e.target.value));
  if(stationSelect) stationSelect.addEventListener('change', (e) => handleStationChange(e.target.value));

  if(fileInput) fileInput.addEventListener('change', handleFileSelection);
  if(removeFileBtn) removeFileBtn.addEventListener('click', clearSelectedFile);

  const uploadZone = document.querySelector('.upload-zone');
  if (uploadZone) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          uploadZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
      });
      ['dragenter', 'dragover'].forEach(eventName => uploadZone.addEventListener(eventName, () => uploadZone.classList.add('border-govblue-500', 'bg-govblue-50'), false));
      ['dragleave', 'drop'].forEach(eventName => uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('border-govblue-500', 'bg-govblue-50'), false));
      uploadZone.addEventListener('drop', handleDrop, false);
  }

  if(btnValidate) btnValidate.addEventListener('click', handleValidateAndPreview);
  if(btnCancelPreview) btnCancelPreview.addEventListener('click', () => toggleModal('previewModal', false));
  if(btnConfirmSubmit) btnConfirmSubmit.addEventListener('click', handleFinalSubmit);
  if(btnCopyRequestId) btnCopyRequestId.addEventListener('click', copyRequestIdToClipboard);
  if(btnResetForm) btnResetForm.addEventListener('click', resetAllForms);

  const btnToggle = document.getElementById('btnTogglePassword');
  if(btnToggle) btnToggle.addEventListener('click', togglePasswordVisibility);
  
  setupForgotIdSystem();
  setupCancelSystem();
}

// ==========================================
// 4. ระบบ TABS และ CAPTCHA
// ==========================================
function switchTab(tabName) {
  hideAlert();
  
  // Clear Status
  const searchResultArea = document.getElementById('searchResultArea');
  if (searchResultArea) searchResultArea.classList.add('hidden');
  if (document.getElementById('searchReqId')) document.getElementById('searchReqId').value = '';
  if (document.getElementById('searchPhone')) document.getElementById('searchPhone').value = '';
  if (document.getElementById('searchCaptcha')) document.getElementById('searchCaptcha').value = '';
  
  // Clear Forgot ID
  const lookupInput = document.getElementById('lookupCitizenId');
  if (lookupInput) { lookupInput.value = ''; lookupInput.dataset.raw = ''; }
  if (document.getElementById('lookupPhone')) document.getElementById('lookupPhone').value = '';
  AppStateStatus.rawCitizenId = ''; 
  AppStateStatus.retrievedPassword = '';
  
  // Clear Cancel
  clearCancelForm();
  
  const sections = ['sectionForm', 'sectionStatus', 'sectionCancel'];
  const tabs = ['tabForm', 'tabStatus', 'tabCancel'];
  
  sections.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
  
  const activeClass = "py-3 text-[14px] sm:text-[15px] font-heading font-semibold rounded-md bg-white text-govblue-900 shadow-sm transition-all flex justify-center items-center gap-1 sm:gap-2";
  const inactiveClass = "py-3 text-[14px] sm:text-[15px] font-heading font-semibold rounded-md text-govgray-600 hover:text-govblue-800 hover:bg-white/50 transition-all flex justify-center items-center gap-1 sm:gap-2";
  const cancelInactiveClass = "py-3 text-[14px] sm:text-[15px] font-heading font-semibold rounded-md text-govgray-600 hover:text-red-600 hover:bg-white/50 transition-all flex justify-center items-center gap-1 sm:gap-2";

  tabs.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.disabled) {
          el.className = (id === 'tabCancel') ? cancelInactiveClass : inactiveClass;
      }
  });

  const activeSection = document.getElementById(tabName === 'form' ? 'sectionForm' : tabName === 'status' ? 'sectionStatus' : 'sectionCancel');
  if (activeSection) activeSection.classList.remove('hidden');

  const activeTab = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (activeTab && !activeTab.disabled) {
      activeTab.className = activeClass;
      if (tabName === 'cancel') activeTab.classList.add('text-red-700'); 
  }

  generateCaptcha(); 
}

function generateCaptcha() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  let charArray = [];
  for (let i = 0; i < 5; i++) charArray.push(letters.charAt(Math.floor(Math.random() * letters.length)));
  charArray.push(numbers.charAt(Math.floor(Math.random() * numbers.length)));

  for (let i = charArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [charArray[i], charArray[j]] = [charArray[j], charArray[i]];
  }

  captchaAnswer = charArray.join('');
  const displayFormat = charArray.join(' '); 

  const displays = ['captchaDisplayStatus', 'captchaDisplayCancel'];
  const inputs = ['searchCaptcha', 'cancelCaptcha'];
  
  displays.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = displayFormat; });
  inputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ==========================================
// 5. ระบบกู้คืนรหัสคำขอ & Masking
// ==========================================
function setupForgotIdSystem() {
    const lookupInput = document.getElementById('lookupCitizenId');
    if (lookupInput) {
        lookupInput.addEventListener('input', function(e) {
            AppStateStatus.rawCitizenId = e.target.value.replace(/\D/g, '').substring(0, 13);
            e.target.value = AppStateStatus.rawCitizenId;
            checkAndFetchAuto(); 
        });
        lookupInput.addEventListener('blur', function(e) {
            if (AppStateStatus.rawCitizenId.length === 13) e.target.value = maskCitizenIdForSearch(AppStateStatus.rawCitizenId);
        });
        lookupInput.addEventListener('focus', function(e) {
            if (AppStateStatus.rawCitizenId) e.target.value = AppStateStatus.rawCitizenId;
        });
    }
    const lookupPhone = document.getElementById('lookupPhone');
    if (lookupPhone) lookupPhone.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10); checkAndFetchAuto(); });
}

const checkAndFetchAuto = () => {
    const isModalOpen = !document.getElementById('forgotIdModal').classList.contains('hidden');
    if (!isModalOpen) return;
    const phone = document.getElementById('lookupPhone') ? document.getElementById('lookupPhone').value.trim() : '';
    if (AppStateStatus.rawCitizenId.length === 13 && phone.length === 10 && !isFetchingId) fetchRequestIdAuto();
};

async function fetchRequestIdAuto() {
    if (isFetchingId) return;
    isFetchingId = true; 
    try {
        const phoneInput = document.getElementById('lookupPhone').value.trim();
        hideAlert();
        toggleModal('forgotIdModal', false); 
        showLoading(true, 'กำลังดึงรหัสคำขออัตโนมัติ...');
        const res = await API.call('apiFindRequestId', { citizenId: AppStateStatus.rawCitizenId, phone: phoneInput });
        showLoading(false);
        isFetchingId = false; 

        if (res && res.success) {
            switchTab('status'); 
            document.getElementById('searchReqId').value = res.requestId;
            document.getElementById('searchPhone').value = phoneInput; 
            showAlert('success', 'ดึงรหัสคำขอสำเร็จ! ระบบเติมข้อมูลในช่องค้นหาให้เรียบร้อยแล้ว');
        } else {
            showAlert('error', res.message || 'ไม่พบรหัสคำขอจากข้อมูลนี้');
            setTimeout(() => toggleModal('forgotIdModal', true), 500); 
        }
    } catch (err) {
        isFetchingId = false; showLoading(false); showAlert('error', 'ระบบขัดข้อง: ' + err.message);
    }
}

// ==========================================
// 6. โหลดข้อมูลเริ่มต้น (ระบบเปิด-ปิด)
// ==========================================
async function loadInitialReferenceData() {
    showLoading(true, 'กำลังเชื่อมต่อระบบส่วนกลาง...');
    try {
        const statusRes = await API.call('apiGetSystemStatus');
        const formSection = document.getElementById('formSection');
        const closedSystemMessage = document.getElementById('closedSystemMessage');
        const tabFormBtn = document.getElementById('tabForm');

        if (statusRes && statusRes.success && statusRes.status === 'closed') {
            showLoading(false);
            if (formSection) formSection.classList.add('hidden'); 
            if (closedSystemMessage) closedSystemMessage.classList.remove('hidden'); 
            if (tabFormBtn) {
                tabFormBtn.disabled = true;
                tabFormBtn.classList.add('opacity-50', 'cursor-not-allowed');
                tabFormBtn.onclick = null; 
            }
            setTimeout(() => {
                const currentSec = document.getElementById('sectionForm');
                if (currentSec && !currentSec.classList.contains('hidden') && (!formSection || formSection.classList.contains('hidden'))) {
                    switchTab('status'); 
                }
            }, 100);
            return; 
        } else {
            if (formSection) formSection.classList.remove('hidden'); 
            if (closedSystemMessage) closedSystemMessage.classList.add('hidden'); 
            if (tabFormBtn) {
                tabFormBtn.disabled = false;
                tabFormBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                tabFormBtn.onclick = () => switchTab('form'); 
            }
        }
        
        showLoading(true, 'กำลังโหลดข้อมูลหน่วยงาน สปส....');
        const res = await API.call('apiGetInitialData');
        showLoading(false);
        if (res && res.success && res.data && res.data.branches) {
            AppState.branches = res.data.branches;
            populateBranchDropdown(res.data.branches);
        }
    } catch (err) {
        showLoading(false); showAlert('error', 'ข้อผิดพลาดเครือข่าย: ' + err.message);
    }
}

function populateBranchDropdown(branches) {
  const select = document.getElementById('ssoBranchCode');
  if(!select) return;
  select.innerHTML = '<option value="">-- เลือกรหัสสำนักงานประกันสังคม --</option>';
  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.code;
    opt.textContent = `${b.code} - ${b.name} (${b.province})`;
    select.appendChild(opt);
  });
}

async function handleBranchChange(branchCode) {
  const stationSelect = document.getElementById('pollingStationId');
  const detailBox = document.getElementById('stationDetailBox');
  if (detailBox) detailBox.classList.add('hidden');
  hideAlert(); 

  if (!branchCode) {
    stationSelect.disabled = true;
    stationSelect.innerHTML = '<option value="">-- กรุณาเลือกรหัส สปส. ก่อน --</option>';
    return;
  }
  showLoading(true, 'กำลังดึงข้อมูลสถานที่เลือกตั้ง...');
  stationSelect.disabled = true;
  stationSelect.innerHTML = '<option value="">-- กำลังโหลดข้อมูล... --</option>';

  try {
      const res = await API.call('apiGetStationsByBranch', branchCode); 
      showLoading(false);
      if (res && res.success) {
        AppState.stationsCache.set(branchCode, res.data.stations || []); 
        populateStationDropdown(res.data.stations || []);
      }
  } catch (err) {
      showLoading(false); stationSelect.innerHTML = '<option value="">-- เกิดข้อผิดพลาด --</option>';
  }
}

function populateStationDropdown(stations) {
  const stationSelect = document.getElementById('pollingStationId');
  if(!stationSelect) return;
  stationSelect.innerHTML = '';
  if (stations.length === 0) {
    stationSelect.disabled = true;
    stationSelect.innerHTML = '<option value="">-- ไม่พบสถานที่เลือกตั้งในสังกัดนี้ --</option>';
    return;
  }
  stationSelect.disabled = false;
  stationSelect.classList.add('bg-white', 'text-govgray-900');
  
  const defaultOpt = document.createElement('option');
  defaultOpt.value = ''; defaultOpt.textContent = `-- เลือกรหัสสถานที่เลือกตั้ง (${stations.length} แห่ง) --`;
  stationSelect.appendChild(defaultOpt);
  stations.forEach(st => {
    const opt = document.createElement('option'); opt.value = st.id; opt.textContent = `${st.id} : ${st.name} - ${st.location}`;
    stationSelect.appendChild(opt);
  });
}

function handleStationChange(stationId) {
  const branchCode = document.getElementById('ssoBranchCode').value;
  const detailBox = document.getElementById('stationDetailBox');
  if (!stationId || !branchCode) { if(detailBox) detailBox.classList.add('hidden'); return; }

  const stations = AppState.stationsCache.get(branchCode) || [];
  const selected = stations.find(s => s.id === stationId);

  if (selected && detailBox) {
    document.getElementById('detailStationName').textContent = `${selected.id} - ${selected.name}`;
    document.getElementById('detailLocation').textContent = selected.location || '-';
    document.getElementById('detailTambon').textContent = selected.tambon || '-';
    document.getElementById('detailAmphur').textContent = selected.amphur || '-';
    document.getElementById('detailProvince').textContent = selected.province || '-';
    detailBox.classList.remove('hidden');
  }
}

// ==========================================
// 7. ระบบตรวจสอบสถานะ
// ==========================================
async function searchStatus() {
  try {
      hideAlert();
      const searchResultArea = document.getElementById('searchResultArea');
      if (searchResultArea) searchResultArea.classList.add('hidden');
      
      const reqId = document.getElementById('searchReqId').value.trim();
      const phone = document.getElementById('searchPhone').value.trim();
      const userCaptcha = document.getElementById('searchCaptcha').value.trim();

      if (!reqId || !phone) return showAlert('error', 'กรุณากรอกรหัสคำขอและเบอร์โทรศัพท์ให้ครบถ้วน');
      if (!userCaptcha || userCaptcha !== captchaAnswer) {
          showAlert('error', 'ยืนยันตัวตนไม่ผ่าน ข้อความที่คุณพิมพ์ไม่ตรงกับภาพ กรุณาลองใหม่อีกครั้ง');
          generateCaptcha(); return;
      }
      showLoading(true, 'กำลังค้นหาข้อมูล...');
      const res = await API.call('apiCheckStatus', { requestId: reqId, phone: phone });
      handleStatusSuccess(res);
  } catch (error) { showLoading(false); showAlert('error', 'ระบบขัดข้อง: ' + error.message); }
}

function handleStatusSuccess(res) {
    showLoading(false);
    generateCaptcha(); 
    const searchResultArea = document.getElementById('searchResultArea');
    if (res && res.success && res.data) {
        if (searchResultArea) searchResultArea.classList.remove('hidden');
        const d = res.data.data;
        const actualStatus = d.status ? String(d.status).trim() : ''; 
        
        const resultPending = document.getElementById('resultPending');
        const resultApproved = document.getElementById('resultApproved');
        const resStatusEl = document.getElementById('resStatus');

        if (resultApproved) resultApproved.classList.add('hidden');
        if (resultPending) resultPending.classList.add('hidden');
        
        if (actualStatus === 'Approved' || actualStatus === 'อนุมัติแล้ว' || actualStatus === 'อนุมัติ' || res.data.isApproved) {
            if (resultApproved) resultApproved.classList.remove('hidden');
            if (resStatusEl) { resStatusEl.textContent = actualStatus; resStatusEl.style.color = '#198754'; resStatusEl.style.backgroundColor = '#d1e7dd'; }
            if (document.getElementById('resUsername')) document.getElementById('resUsername').textContent = d.username || '-';
            
            const resPasswordEl = document.getElementById('resPassword');
            const btnToggle = document.getElementById('btnTogglePassword');
            if (resPasswordEl) {
                AppStateStatus.retrievedPassword = d.password || ''; 
                resPasswordEl.textContent = '••••••••';
                AppStateStatus.isPasswordVisible = false;
                if (AppStateStatus.retrievedPassword) { if(btnToggle) btnToggle.classList.remove('hidden'); } 
                else { if(btnToggle) btnToggle.classList.add('hidden'); }
                if (document.getElementById('iconEyeOff')) document.getElementById('iconEyeOff').classList.remove('hidden');
                if (document.getElementById('iconEyeOn')) document.getElementById('iconEyeOn').classList.add('hidden');
            }
            
            const rowRemark = document.getElementById('rowRemark');
            if (rowRemark) {
                if (d.remark) { document.getElementById('resRemark').textContent = d.remark; rowRemark.classList.remove('hidden'); rowRemark.classList.add('grid'); } 
                else { rowRemark.classList.add('hidden'); rowRemark.classList.remove('grid'); }
            }

            if (document.getElementById('resCitizenId')) document.getElementById('resCitizenId').textContent = maskCitizenIdForSearch(d.citizenId);
            if (document.getElementById('resName')) document.getElementById('resName').textContent = `${d.firstname} ${d.lastname}`;
            if (document.getElementById('resNameEn')) document.getElementById('resNameEn').textContent = `${d.firstnameEn} ${d.lastnameEn}`;
            if (document.getElementById('resEmail')) document.getElementById('resEmail').textContent = d.email;
            if (document.getElementById('resPhone')) document.getElementById('resPhone').textContent = d.phone;
            if (document.getElementById('resSso')) document.getElementById('resSso').textContent = d.ssoBranchDisplay;
            if (document.getElementById('resStation')) document.getElementById('resStation').textContent = d.pollingStationDisplay;

        } else if (actualStatus === 'ไม่อนุมัติ' || actualStatus === 'Rejected' || actualStatus === 'ยกเลิก') {
            if (resultPending) {
                resultPending.classList.remove('hidden');
                resultPending.className = "mt-6 p-0 border border-red-300 rounded-lg overflow-hidden"; 
                const remarkText = d.remark || 'ไม่ได้ระบุสาเหตุ';
                const statusHead = actualStatus === 'ยกเลิก' ? 'คำขอนี้ถูกยกเลิกแล้ว' : 'คำขอไม่ผ่านการอนุมัติ';
                
                resultPending.innerHTML = `
                    <div style="background-color: #f8d7da; padding: 15px 20px; display: flex; align-items: center; border-bottom: 1px solid #f5c2c7;">
                        <div style="background-color: #dc3545; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; justify-content: center; align-items: center; margin-right: 12px; font-weight: bold; font-size: 14px;">✕</div>
                        <strong style="margin: 0; color: #842029; font-size: 16px;">${statusHead}</strong>
                    </div>
                    <div style="padding: 20px; background-color: #ffffff;">
                        <div style="display: flex; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f3f5;">
                            <strong style="width: 130px; color: #dc3545; font-size: 15px;">สถานะ:</strong> 
                            <span style="color: #212529; font-size: 15px;">${actualStatus}</span>
                        </div>
                        <div style="display: flex;">
                            <strong style="width: 130px; color: #6c757d; font-size: 15px;">หมายเหตุ:</strong> 
                            <span style="color: #212529; font-size: 15px;">${remarkText}</span>
                        </div>
                    </div>
                `;
            }
        } else {
            if (resultPending) {
                resultPending.classList.remove('hidden');
                resultPending.className = "mt-6 p-0 border border-yellow-300 rounded-lg overflow-hidden"; 
                resultPending.innerHTML = `
                    <div style="background-color: #fff3cd; padding: 15px 20px; display: flex; align-items: center; border-bottom: 1px solid #ffeeba;">
                        <div style="background-color: #ffc107; color: #000; border-radius: 50%; width: 24px; height: 24px; display: flex; justify-content: center; align-items: center; margin-right: 12px; font-weight: bold; font-size: 14px;">!</div>
                        <strong style="margin: 0; color: #856404; font-size: 16px;">สถานะ: อยู่ระหว่างการพิจารณา</strong>
                    </div>
                    <div style="padding: 20px; background-color: #ffffff; text-align: center;">
                        <p style="color: #6c757d; font-size: 15px; margin-bottom: 10px;">สำนักงานประกันสังคมได้รับคำขอของท่านแล้ว ขณะนี้อยู่ระหว่างขั้นตอนการตรวจสอบเอกสาร</p>
                    </div>
                `;
            }
        }
    } else { showAlert('error', res.message || 'ไม่พบข้อมูลคำขอ กรุณาตรวจสอบรหัสและเบอร์โทรศัพท์'); }
}

function clearStatusForm() {
    hideAlert();
    const searchResultArea = document.getElementById('searchResultArea');
    if (searchResultArea) searchResultArea.classList.add('hidden');

    if (document.getElementById('searchReqId')) document.getElementById('searchReqId').value = '';
    if (document.getElementById('searchPhone')) document.getElementById('searchPhone').value = '';
    if (document.getElementById('searchCaptcha')) document.getElementById('searchCaptcha').value = '';

    const lookupInput = document.getElementById('lookupCitizenId');
    if (lookupInput) { lookupInput.value = ''; lookupInput.dataset.raw = ''; }
    if (document.getElementById('lookupPhone')) document.getElementById('lookupPhone').value = '';
    AppStateStatus.rawCitizenId = '';
    AppStateStatus.retrievedPassword = '';

    generateCaptcha();
}

function togglePasswordVisibility() {
  const resPasswordEl = document.getElementById('resPassword');
  if (!resPasswordEl) return;
  const actualPassword = AppStateStatus.retrievedPassword;
  if (!actualPassword) return;

  AppStateStatus.isPasswordVisible = !AppStateStatus.isPasswordVisible; 
  if (AppStateStatus.isPasswordVisible) {
      resPasswordEl.textContent = actualPassword;
      document.getElementById('iconEyeOff').classList.add('hidden');
      document.getElementById('iconEyeOn').classList.remove('hidden');
  } else {
      resPasswordEl.textContent = '••••••••';
      document.getElementById('iconEyeOff').classList.remove('hidden');
      document.getElementById('iconEyeOn').classList.add('hidden');
  }
}

// ==========================================
// 8. 🔴 ระบบขอยกเลิกการใช้งาน (แท็บที่ 4)
// ==========================================
function setupCancelSystem() {
    const cancelCitInput = document.getElementById('cancelCitizenId');
    if (cancelCitInput) {
        cancelCitInput.addEventListener('input', function(e) {
            AppStateStatus.cancelRawCitizenId = e.target.value.replace(/\D/g, '').substring(0, 13);
            e.target.value = AppStateStatus.cancelRawCitizenId;
        });
        cancelCitInput.addEventListener('blur', function(e) {
            if (AppStateStatus.cancelRawCitizenId.length === 13) e.target.value = maskCitizenIdForSearch(AppStateStatus.cancelRawCitizenId);
        });
        cancelCitInput.addEventListener('focus', function(e) {
            if (AppStateStatus.cancelRawCitizenId) e.target.value = AppStateStatus.cancelRawCitizenId;
        });
    }
}

// ==========================================
// 🔴 ฟังก์ชันของแท็บ ขอยกเลิกการใช้งาน (อัปเดตแก้ Bug Null)
// ==========================================
async function searchCancelInfo() {
  hideAlert();
  const resArea = document.getElementById('cancelResultArea');
  if (resArea) resArea.classList.add('hidden');
  const successSec = document.getElementById('cancelSuccessSection');
  if (successSec) successSec.classList.add('hidden');
  
  const citId = AppStateStatus.cancelRawCitizenId;
  const phone = document.getElementById('cancelPhone').value.trim();
  const captcha = document.getElementById('cancelCaptcha').value.trim();

  if (!citId || citId.length !== 13 || !phone) {
      return showAlert('error', 'กรุณากรอกเลขประจำตัวประชาชน 13 หลัก และเบอร์โทรศัพท์ให้ครบถ้วน');
  }
  if (!captcha || captcha !== captchaAnswer) {
      showAlert('error', 'ยืนยันตัวตนไม่ผ่าน กรุณาพิมพ์ข้อความให้ตรงกับภาพ');
      generateCaptcha(); return;
  }

  showLoading(true, 'กำลังค้นหาข้อมูลคำขอของคุณ...');
  try {
      const res = await API.call('apiGetCancelInfo', { citizenId: citId, phone: phone });
      showLoading(false);
      generateCaptcha();
      
      if (res && res.success) {
          const d = res.data;
          if (resArea) resArea.classList.remove('hidden');
          
          // 💡 เทคนิค Fail-Safe: ตรวจสอบว่ามี Element ไหมก่อนยัดค่าใส่ ป้องกัน Error Null
          const setSafeText = (id, text) => {
              const el = document.getElementById(id);
              if (el) el.textContent = text;
          };

          // อัปเดตข้อมูล (ถ้า ID ไหนคุณลบออกจาก HTML ไปแล้ว โค้ดก็จะไม่พัง)
          setSafeText('cancelResReqId', d.requestId);
          setSafeText('cancelResCitizenId', maskCitizenIdForSearch(d.citizenId)); // เผื่อคุณนำกลับมาใช้
          setSafeText('cancelResName', `${maskNameText(d.firstname)} ${maskNameText(d.lastname)}`);
          
          // เพิ่มการแสดงผล ชื่อภาษาอังกฤษ (อิงตาม UI ใหม่ของคุณ)
          setSafeText('cancelResNameEn', `${maskNameText(d.firstname_en)} ${maskNameText(d.lastname_en)}`);
          
          setSafeText('cancelResEmail', maskEmailText(d.email));
          setSafeText('cancelResStation', d.stationDisplay);
          
          const statusEl = document.getElementById('cancelResStatus');
          if (statusEl) statusEl.textContent = d.status;
          
          const actionBox = document.getElementById('cancelActionBox');
          const warningBox = document.getElementById('cancelWarningBox');
          
          if (d.status === 'ยกเลิก' || d.status === 'ยกเลิกสิทธิ์' || d.status === 'ไม่อนุมัติ') {
              if (statusEl) statusEl.className = "sm:col-span-2 font-bold text-red-600";
              if (actionBox) actionBox.classList.add('hidden');
              if (warningBox) warningBox.classList.remove('hidden');
          } else {
              if (statusEl) statusEl.className = "sm:col-span-2 font-bold text-emerald-600";
              if (actionBox) actionBox.classList.remove('hidden');
              if (warningBox) warningBox.classList.add('hidden');
              AppStateStatus.cancelRequestIdToSubmit = d.requestId;
          }
      } else {
          showAlert('error', res.message || 'ไม่พบข้อมูลคำขอ กรุณาตรวจสอบเลขประจำตัวและเบอร์โทรศัพท์');
      }
  } catch (error) {
      showLoading(false);
      showAlert('error', 'ระบบขัดข้อง: ' + error.message);
  }
}

function confirmCancellation() {
  const reqId = AppStateStatus.cancelRequestIdToSubmit;
  const phone = document.getElementById('cancelPhone').value.trim();
  const citId = AppStateStatus.cancelRawCitizenId;
  
  if(!reqId || !phone || !citId) return;

  Swal.fire({
      title: 'คุณแน่ใจหรือไม่?',
      html: 'หากกดยืนยัน <span class="font-bold text-red-600">รหัสผ่านและสิทธิ์การใช้งานของคุณจะถูกระงับทันที</span><br><span class="text-sm text-gray-500">คุณจะต้องยื่นคำขอเข้ามาใหม่หากต้องการใช้งานอีกครั้ง</span>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '<i class="fa-solid fa-triangle-exclamation"></i> ยืนยันการระงับสิทธิ์',
      cancelButtonText: 'ปิด'
  }).then(async (result) => {
      if (result.isConfirmed) {
          showLoading(true, 'กำลังดำเนินการยกเลิกสิทธิ์...');
          try {
              const res = await API.call('apiSubmitCancel', { citizenId: citId, phone: phone });
              showLoading(false);
              if (res && res.success) {
                  document.getElementById('cancelResultArea').classList.add('hidden');
                  document.getElementById('cancelSuccessSection').classList.remove('hidden');
              } else {
                  Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
              }
          } catch (err) {
              showLoading(false);
              showAlert('error', 'ระบบขัดข้อง: ' + err.message);
          }
      }
  });
}

function clearCancelForm() {
  hideAlert();
  if(document.getElementById('cancelResultArea')) document.getElementById('cancelResultArea').classList.add('hidden');
  if(document.getElementById('cancelSuccessSection')) document.getElementById('cancelSuccessSection').classList.add('hidden');
  
  if(document.getElementById('cancelCitizenId')) document.getElementById('cancelCitizenId').value = '';
  if(document.getElementById('cancelPhone')) document.getElementById('cancelPhone').value = '';
  if(document.getElementById('cancelCaptcha')) document.getElementById('cancelCaptcha').value = '';
  
  AppStateStatus.cancelRawCitizenId = '';
  AppStateStatus.cancelRequestIdToSubmit = '';
  generateCaptcha();
}

// ==========================================
// 9. Helper Functions ทั่วไป 
// ==========================================
function showAlert(type, message) {
  const alertBox = document.getElementById('alertBox');
  const alertIcon = document.getElementById('alertIcon');
  const alertMsg = document.getElementById('alertMessage');

  if(!alertBox) return;
  alertMsg.textContent = message;
  alertBox.className = 'mb-6 p-4 rounded-lg border text-sm flex items-start space-x-3 shadow-sm';

  if (type === 'error') {
    alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
    alertIcon.innerHTML = `<svg class="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`;
  } else {
    alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    alertIcon.innerHTML = `<svg class="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
  }
  alertBox.classList.remove('hidden');
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideAlert() {
  const alertBox = document.getElementById('alertBox');
  if(alertBox) alertBox.classList.add('hidden');
}

function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if(!modal) return;
  if (show) { modal.classList.remove('hidden'); document.body.classList.add('overflow-hidden'); } 
  else { modal.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }
}

function showLoading(show, text = 'กำลังประมวลผล...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  if(!overlay) return;
  if(loadingText) loadingText.textContent = text;
  if (show) overlay.classList.remove('hidden'); else overlay.classList.add('hidden');
}

function maskNameText(text) {
  if (!text) return '-';
  const clean = text.trim();
  if (clean.length <= 1) return clean + '***';
  const first = clean.charAt(0);
  const stars = clean.length > 4 ? 4 : clean.length - 1;
  return first + '*'.repeat(stars);
}

function maskEmailText(email) {
  if (!email || !email.includes('@')) return maskNameText(email);
  const parts = email.split('@');
  return parts[0].charAt(0) + '***@' + parts[1];
}

function maskCitizenIdForSearch(id) {
  if (!id || id.length !== 13) return id;
  return `${id.substring(0, 1)}-XXXX-XXXXX-${id.substring(10, 12)}-${id.substring(12, 13)}`;
}

// ==========================================
// 10. ระบบไฟล์และการคำนวณ Validation (หน้ายื่นคำขอ)
// ==========================================
function handleDrop(e) { const dt = e.dataTransfer; if (dt.files.length > 0) processFiles(dt.files); }
function handleFileSelection(event) { if (event.target.files.length > 0) processFiles(event.target.files); }
async function processFiles(fileList) {
    const validExts = ['pdf', 'jpg', 'jpeg', 'png']; const files = Array.from(fileList);
    let totalSize = 0; let hasPdf = false; let hasImg = false; let validFiles = [];
    for (let i = 0; i < files.length; i++) {
        const ext = files[i].name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) { showAlert('error', `ไม่รองรับไฟล์ .${ext}`); clearSelectedFile(); return; }
        if (ext === 'pdf') hasPdf = true; else hasImg = true;
        totalSize += files[i].size; validFiles.push(files[i]);
    }
    if (hasPdf && hasImg) { showAlert('error', 'ห้ามแนบ PDF ปนกับรูปภาพ'); clearSelectedFile(); return; }
    if (totalSize > 10 * 1024 * 1024) { showAlert('error', `ขนาดเกิน 10 MB`); clearSelectedFile(); return; }

    showLoading(true, 'กำลังเตรียมไฟล์อัปโหลด...');
    try {
        if (hasImg && window.jspdf) {
            const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4'); 
            for (let i = 0; i < validFiles.length; i++) {
                const imgDataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(validFiles[i]); });
                const imgDims = await getImageDimensions(imgDataUrl);
                const ratio = Math.min(pdf.internal.pageSize.getWidth() / imgDims.width, pdf.internal.pageSize.getHeight() / imgDims.height);
                if (i > 0) pdf.addPage(); 
                pdf.addImage(imgDataUrl, validFiles[i].type === 'image/png' ? 'PNG' : 'JPEG', (pdf.internal.pageSize.getWidth() - imgDims.width * ratio) / 2, (pdf.internal.pageSize.getHeight() - imgDims.height * ratio) / 2, imgDims.width * ratio, imgDims.height * ratio);
            }
            AppState.selectedFiles = [{ filename: `NDA_รอสร้างรหัสคำขอ.pdf`, mimeType: 'application/pdf', base64: pdf.output('datauristring') }];
        } else {
            AppState.selectedFiles = await Promise.all(validFiles.map(file => new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res({ filename: file.name, mimeType: file.type, base64: e.target.result }); r.onerror = rej; r.readAsDataURL(file); }))); 
        }
        document.getElementById('fileNameLabel').textContent = AppState.selectedFiles.length === 1 ? AppState.selectedFiles[0].filename : `เลือก ${AppState.selectedFiles.length} ไฟล์`;
        document.getElementById('selectedFileInfo').classList.remove('hidden');
        showLoading(false); 
    } catch (e) { showLoading(false); showAlert('error', 'รวบรวมไฟล์ล้มเหลว'); clearSelectedFile(); }
}
function getImageDimensions(url) { return new Promise(res => { const img = new Image(); img.onload = () => res({ width: img.width, height: img.height }); img.src = url; }); }
function clearSelectedFile() { if(document.getElementById('ndaFile')) document.getElementById('ndaFile').value = ''; document.getElementById('selectedFileInfo').classList.add('hidden'); AppState.selectedFiles = []; }
function checkCitizenIdChecksum(id) {
  if (!id || id.length !== 13 || !/^\d{13}$/.test(id)) return false;
  let sum = 0; for (let i = 0; i < 12; i++) sum += parseInt(id.charAt(i), 10) * (13 - i);
  return (11 - (sum % 11)) % 10 === parseInt(id.charAt(12), 10);
}

async function handleValidateAndPreview() {
  hideAlert();
  const p = { citizenId: document.getElementById('citizenId').value.trim(), firstname: document.getElementById('firstname').value.trim(), lastname: document.getElementById('lastname').value.trim(), firstnameEn: document.getElementById('firstnameEn') ? document.getElementById('firstnameEn').value.trim() : '', lastnameEn: document.getElementById('lastnameEn') ? document.getElementById('lastnameEn').value.trim() : '', email: document.getElementById('email').value.trim(), phone: document.getElementById('phone').value.trim(), ssoBranchCode: document.getElementById('ssoBranchCode').value.trim(), pollingStationId: document.getElementById('pollingStationId').value.trim() };
  if (!p.citizenId || !checkCitizenIdChecksum(p.citizenId)) return showAlert('error', 'เลขบัตรประชาชนไม่ถูกต้อง');
  if (!p.firstname || !p.lastname) return showAlert('error', 'กรุณาระบุชื่อ-นามสกุล');
  if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return showAlert('error', 'อีเมลไม่ถูกต้อง');
  if (!p.phone || !/^0\d{9}$/.test(p.phone)) return showAlert('error', 'เบอร์โทรศัพท์ 10 หลัก');
  if (!p.ssoBranchCode || !p.pollingStationId) return showAlert('error', 'เลือกรหัสสถานที่');
  if (AppState.selectedFiles.length === 0) return showAlert('error', 'กรุณาแนบ NDA');
  
  showLoading(true, 'ตรวจสอบข้อมูล...');
  try {
      const res = await API.call('apiValidateBeforePreview', { ...p, fileData: AppState.selectedFiles.map(f => ({filename: f.filename, mimeType: f.mimeType, base64: ''})) });
      showLoading(false);
      if (res && res.success) {
        document.getElementById('prevCitizenId').textContent = res.data.maskedCitizenId || maskCitizenIdForSearch(p.citizenId);
        document.getElementById('prevName').textContent = `${maskNameText(p.firstname)} ${maskNameText(p.lastname)}`;
        if (document.getElementById('prevNameEn')) document.getElementById('prevNameEn').textContent = `${maskNameText(p.firstnameEn)} ${maskNameText(p.lastnameEn)}`;
        document.getElementById('prevEmail').textContent = p.email; document.getElementById('prevPhone').textContent = p.phone;
        document.getElementById('prevSsoBranch').textContent = p.ssoBranchCode; document.getElementById('prevPollingStation').textContent = p.pollingStationId;
        document.getElementById('prevFileName').textContent = AppState.selectedFiles.length === 1 ? AppState.selectedFiles[0].filename : `รูปภาพ ${AppState.selectedFiles.length} ไฟล์`;
        toggleModal('previewModal', true);
      } else { showAlert('error', res.message); }
  } catch(err) { showLoading(false); showAlert('error', err.message); }
}

async function handleFinalSubmit() {
  if (AppState.isSubmitting) return; toggleModal('previewModal', false); AppState.isSubmitting = true;
  showLoading(true, 'กำลังอัปโหลดและสร้างคำขอ...');
  const p = { citizenId: document.getElementById('citizenId').value.trim(), firstname: document.getElementById('firstname').value.trim(), lastname: document.getElementById('lastname').value.trim(), firstnameEn: document.getElementById('firstnameEn') ? document.getElementById('firstnameEn').value.trim() : '', lastnameEn: document.getElementById('lastnameEn') ? document.getElementById('lastnameEn').value.trim() : '', email: document.getElementById('email').value.trim(), phone: document.getElementById('phone').value.trim(), ssoBranchCode: document.getElementById('ssoBranchCode').value.trim(), pollingStationId: document.getElementById('pollingStationId').value.trim(), fileData: AppState.selectedFiles };
  try {
      const res = await API.call('apiSubmitRequest', p);
      showLoading(false); AppState.isSubmitting = false;
      if (res && res.success) {
        document.getElementById('displayRequestId').textContent = res.data.requestId;
        document.getElementById('formSection').classList.add('hidden'); document.getElementById('successSection').classList.remove('hidden'); window.scrollTo(0,0);
      } else showAlert('error', res.message);
  } catch(e) { showLoading(false); AppState.isSubmitting = false; showAlert('error', e.message); }
}

function copyRequestIdToClipboard() { const r = document.getElementById('displayRequestId'); if(r) navigator.clipboard.writeText(r.textContent.trim()).then(() => { const b = document.getElementById('copyBtnText'); if(b) { b.textContent = 'คัดลอกสำเร็จ!'; setTimeout(() => b.textContent = 'คัดลอก Request ID', 2000); }}); }

function resetAllForms() { if(document.getElementById('userRequestForm')) document.getElementById('userRequestForm').reset(); clearSelectedFile(); const s = document.getElementById('pollingStationId'); if(s) { s.disabled = true; s.innerHTML = '<option>-- เลือกรหัส สปส. ก่อน --</option>'; } document.getElementById('successSection').classList.add('hidden'); document.getElementById('formSection').classList.remove('hidden'); window.scrollTo(0,0); }
