import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Monitor, Wrench, Calendar, Search, Trash2, CheckCircle2, ClipboardList, PenTool, FileText, Download, Loader2, Clock, Lock, Unlock, Bell, School, Camera, X, Image as ImageIcon, Volume2, VolumeX } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

// ============================================================
// FIREBASE AYARLARI
// Bu değerler kod içine yazılmaz; .env dosyasından okunur.
// Kurulum: Firebase Console > Proje Ayarları > Web Uygulaması
// bölümünden aldığınız bilgileri proje kökündeki .env dosyasına
// yazın (bkz. .env.example ve README.md).
// ============================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Firestore'da kayıtların tutulduğu koleksiyon yolu
const RECORDS_COLLECTION = 'ariza_kayitlari';

// ============================================================
// NTFY AYARLARI (bildirim sistemi)
// Kendi ntfy konunuzu buraya yazın. Konu adı tahmin edilemeyecek
// kadar özgün olmalı, çünkü ntfy.sh'de herkese açık konular
// varsayılan olarak herkes tarafından okunabilir.
// Örn: "okul-ariza-takip-cgi-2026" gibi okulunuza özel bir ek yapın.
// ============================================================
const NTFY_TOPIC = 'okul-ariza-takip';
const NTFY_SERVER = 'https://ntfy.sh';

// Sınıf Kategorileri
const CATEGORIES = [
  '1. Sınıflar',
  '2. Sınıflar',
  '3. Sınıflar',
  '4. Sınıflar',
  'Anasınıfı',
  'Özel Eğitim',
  'Diğer (Kütüphane, vb.)'
];

const BRANCHES = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];

const ACTION_TYPES = [
  'Akıllı Tahta / Bilişim',
  'Elektrik / Aydınlatma / Priz',
  'Mobilya / Sıra / Dolap Tamiri',
  'Kapı / Pencere / Kilit Onarımı',
  'Tesisat / Lavabo / Su Sorunu',
  'Isınma / Kalorifer / Petek',
  'Diğer'
];

const TEACHER_ISSUES = [
  'Akıllı Tahta Arızası',
  'Lamba Yanmıyor / Elektrik Sorunu',
  'Sıra / Masa / Dolap Kırık',
  'Kapı / Pencere Kapanmıyor veya Bozuk',
  'Priz / Şalter Arızası',
  'Su Sızıntısı / Lavabo Sorunu',
  'Isınma / Petek Sorunu',
  'Diğer (Lütfen Açıklamada Belirtiniz)'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [appMode, setAppMode] = useState('teacher');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  // NOT: PIN istemci tarafında saklanır, gerçek bir güvenlik sınırı DEĞİLDİR.
  // Kayıtları asıl koruyan katman Firestore güvenlik kurallarıdır (firestore.rules).
  const ADMIN_PIN = '145353';

  // BİLDİRİM STATE'LERİ
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const notificationsEnabledRef = useRef(true);
  const lastNewRequestCount = useRef(-1);
  const audioContextUnlocked = useRef(false);

  const [activeTab, setActiveTab] = useState('list');
  const [isMobileFormOpen, setIsMobileFormOpen] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [customBranch, setCustomBranch] = useState('');
  const [actionType, setActionType] = useState(ACTION_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Çözüldü');
  const [aImages, setAImages] = useState([]);

  const [tCategory, setTCategory] = useState(CATEGORIES[0]);
  const [tBranch, setTBranch] = useState(BRANCHES[0]);
  const [tCustomBranch, setTCustomBranch] = useState('');
  const [tIssue, setTIssue] = useState(TEACHER_ISSUES[0]);
  const [tNotes, setTNotes] = useState('');
  const [tName, setTName] = useState('');
  const [tImages, setTImages] = useState([]);
  const [isTeacherSubmitted, setIsTeacherSubmitted] = useState(false);

  const [viewingImage, setViewingImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [listFilter, setListFilter] = useState('Tümü');
  const hasAutoFiltered = useRef(false);

  const [reportCategory, setReportCategory] = useState('Tüm Sınıflar');
  const [reportBranch, setReportBranch] = useState('Tümü');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const isOtherCategory = category === 'Diğer (Kütüphane, vb.)';
  const isTOtherCategory = tCategory === 'Diğer (Kütüphane, vb.)';

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  // ntfy ile bildirim gönderme (Telegram'ın yerini aldı)
  const sendNtfyNotification = (record) => {
    if (!NTFY_TOPIC) return;
    try {
      const photoCount = Array.isArray(record.image) ? record.image.length : (record.image ? 1 : 0);
      const message =
        `Konum: ${record.category} - ${record.branch}\n` +
        `Sorun: ${record.actionType}\n` +
        `Bildiren: ${record.reporterName}\n` +
        `Fotoğraf: ${photoCount} adet\n` +
        `Not: ${record.notes || '-'}`;

      // JSON yayın biçimi kullanılıyor: HTTP başlıklarında Türkçe karakter
      // sorunu yaşanmaması için (ör. "İ", "ş", "ğ") başlık yerine gövdeye yazıyoruz.
      fetch(NTFY_SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: NTFY_TOPIC,
          title: 'Yeni Arıza Talebi',
          message,
          priority: 5,
          tags: ['rotating_light', 'school']
        })
      }).catch((error) => console.error('ntfy gönderim hatası:', error));
    } catch (error) {
      console.error(error);
    }
  };

  const unlockAudio = () => {
    if (audioContextUnlocked.current) return;
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0;
    audio.play().then(() => { audioContextUnlocked.current = true; }).catch(() => {});
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error(error);
        setAuthError(
          'Firebase bağlantısı kurulamadı. .env dosyanızdaki Firebase bilgilerini ve ' +
          'Firebase Console > Authentication > Sign-in method bölümünde "Anonymous" ' +
          'girişinin açık olduğunu kontrol edin.'
        );
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const recordsRef = collection(db, RECORDS_COLLECTION);
    const unsubscribe = onSnapshot(
      recordsRef,
      (snapshot) => {
        const fetchedRecords = [];
        snapshot.forEach((docSnap) => { fetchedRecords.push({ id: docSnap.id, ...docSnap.data() }); });
        fetchedRecords.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return (b.timestamp || 0) - (a.timestamp || 0);
        });
        const newReqsCount = fetchedRecords.filter(r => r.status === 'Yeni Talep').length;
        if (lastNewRequestCount.current !== -1 && newReqsCount > lastNewRequestCount.current) {
          const lastRecord = fetchedRecords.find(r => r.status === 'Yeni Talep');
          triggerNotification(lastRecord);
        }
        lastNewRequestCount.current = newReqsCount;
        setRecords(fetchedRecords);
        if (!hasAutoFiltered.current) {
          if (newReqsCount > 0) setListFilter('Yeni Talep');
          hasAutoFiltered.current = true;
        }
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setIsLoading(false);
        setAuthError('Kayıtlar okunamadı. Firestore güvenlik kurallarınızı kontrol edin (firestore.rules).');
      }
    );
    return () => unsubscribe();
  }, [user]);

  const toggleNotifications = () => {
    if (notificationsEnabled) { setNotificationsEnabled(false); }
    else {
      unlockAudio();
      if (!('Notification' in window)) { setNotificationsEnabled(true); return; }
      Notification.requestPermission().then(() => { setNotificationsEnabled(true); });
    }
  };

  const triggerNotification = (record) => {
    if (!notificationsEnabledRef.current || !record) return;
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {});
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 Yeni Arıza Talebi!', {
        body: `${record.category} - ${record.branch}: ${record.actionType}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png'
      });
    }
  };

  const handlePinSubmit = () => {
    if (pinInput === ADMIN_PIN) {
      setAppMode('admin'); setShowPinModal(false); setPinInput(''); setPinError(false); unlockAudio();
    } else { setPinError(true); }
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const newId = crypto.randomUUID();
    const newRecord = {
      date, category, branch: isOtherCategory ? customBranch : branch,
      actionType, notes, status, submittedBy: 'Yönetici',
      reporterName: 'Yönetici', timestamp: Date.now(), image: aImages
    };
    try {
      await setDoc(doc(db, RECORDS_COLLECTION, newId), newRecord);
      setNotes(''); setStatus('Çözüldü'); setAImages([]);
      if (isOtherCategory) setCustomBranch('');
      setIsMobileFormOpen(false);
    } catch (error) { console.error(error); }
  };

  const handleTeacherSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const newId = crypto.randomUUID();
    const branchVal = isTOtherCategory ? tCustomBranch : tBranch;
    const newRecord = {
      date: new Date().toISOString().split('T')[0],
      category: tCategory, branch: branchVal, actionType: tIssue, notes: tNotes,
      status: 'Yeni Talep', submittedBy: 'Öğretmen', reporterName: tName || 'Öğretmen',
      timestamp: Date.now(), image: tImages
    };
    try {
      await setDoc(doc(db, RECORDS_COLLECTION, newId), newRecord);
      sendNtfyNotification(newRecord);
      setIsTeacherSubmitted(true);
      setTimeout(() => {
        setIsTeacherSubmitted(false); setTNotes(''); setTName(''); setTImages([]);
        if (isTOtherCategory) setTCustomBranch('');
      }, 4000);
    } catch (error) { console.error(error); }
  };

  const handleImageUpload = (e, setImagesFunction) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    selectedFiles.forEach(file => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > height) { if (width > 800) { height *= 800 / width; width = 800; } }
          else { if (height > 800) { width *= 800 / height; height = 800; } }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setImagesFunction(prev => [...prev, dataUrl]);
        };
      };
    });
    e.target.value = '';
  };

  const removeImage = (index, setImagesFunction, currentImages) => {
    const newList = [...currentImages];
    newList.splice(index, 1);
    setImagesFunction(newList);
  };

  const handleDelete = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, RECORDS_COLLECTION, id));
  };

  const updateStatus = async (id, newStatus) => {
    if (!user) return;
    await updateDoc(doc(db, RECORDS_COLLECTION, id), { status: newStatus });
  };

  const filteredRecords = useMemo(() => {
    let result = records;
    if (listFilter !== 'Tümü') result = result.filter(r => (r.status || 'Çözüldü') === listFilter);
    if (!searchTerm) return result;
    const s = searchTerm.toLowerCase().trim().split(/\s+/);
    return result.filter(record => {
      const text = `${record.category} ${record.branch} ${record.actionType} ${record.notes} ${record.status}`.toLowerCase();
      return s.every(term => text.includes(term));
    });
  }, [records, searchTerm, listFilter]);

  const recordCounts = useMemo(() => ({
    all: records.length,
    newReq: records.filter(r => r.status === 'Yeni Talep').length,
    pending: records.filter(r => r.status === 'Parça Bekliyor').length,
    resolved: records.filter(r => (r.status || 'Çözüldü') === 'Çözüldü').length
  }), [records]);

  const reportRecords = useMemo(() => records.filter(r => {
    if (reportCategory !== 'Tüm Sınıflar' && r.category !== reportCategory) return false;
    if (reportCategory === 'Diğer (Kütüphane, vb.)') {
      return reportBranch === 'Tümü' || (r.branch || '').toLowerCase().includes(reportBranch.toLowerCase());
    }
    return reportBranch === 'Tümü' || r.branch === reportBranch;
  }), [records, reportCategory, reportBranch]);

  const exportToExcel = () => {
    if (reportRecords.length === 0) return;
    const generate = () => {
      const workbook = new window.ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Servis Raporu');
      worksheet.columns = [
        { header: 'Tarih', key: 'date', width: 15 },
        { header: 'Sınıf Grubu', key: 'category', width: 20 },
        { header: 'Şube / Mekan', key: 'branch', width: 15 },
        { header: 'İşlem Tipi', key: 'action', width: 30 },
        { header: 'Durum', key: 'status', width: 18 },
        { header: 'Bildiren Kişi', key: 'reporter', width: 20 },
        { header: 'Detaylı Notlar', key: 'notes', width: 50 }
      ];
      worksheet.insertRow(1, ['Okul Arıza ve Bakım Raporu']);
      worksheet.mergeCells('A1:G1');
      const mainTitle = worksheet.getRow(1);
      mainTitle.height = 30;
      mainTitle.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      mainTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      mainTitle.alignment = { vertical: 'middle', horizontal: 'center' };
      const filterText = reportCategory === 'Tüm Sınıflar' ? 'Tüm Sınıflar ve Şubeler' : `${reportCategory} - ${reportBranch}`;
      worksheet.insertRow(2, [`Filtre: ${filterText}  |  Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`]);
      worksheet.mergeCells('A2:G2');
      const subTitle = worksheet.getRow(2);
      subTitle.font = { name: 'Arial', size: 11, italic: true };
      subTitle.alignment = { vertical: 'middle', horizontal: 'center' };
      const headerRow = worksheet.getRow(3);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      reportRecords.forEach((record, index) => {
        const photoCount = Array.isArray(record.image) ? record.image.length : (record.image ? 1 : 0);
        const row = worksheet.addRow({
          date: new Date(record.date).toLocaleDateString('tr-TR'),
          category: record.category,
          branch: record.branch,
          action: record.actionType,
          status: record.status || 'Çözüldü',
          reporter: record.reporterName || 'Yönetici',
          notes: photoCount > 0 ? `${record.notes} [${photoCount} Fotoğraf]` : record.notes
        });
        row.height = 20;
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        });
      });
      workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Okul_Ariza_Raporu_${new Date().toLocaleDateString('tr-TR')}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      });
    };
    if (!window.ExcelJS) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
      script.onload = generate;
      document.body.appendChild(script);
    } else generate();
  };

  const exportToPDF = () => {
    if (reportRecords.length === 0) return;
    setIsGeneratingPdf(true);
    const generate = () => {
      const pdfDoc = new window.jspdf.jsPDF('landscape');
      const trMap = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' };
      const normalizeTr = (text) => text ? String(text).replace(/[çğıöşüÇĞİÖŞÜ]/g, match => trMap[match]) : '';
      pdfDoc.setFontSize(18);
      pdfDoc.text('Okul Ariza ve Bakim Raporu', 14, 22);
      const tableData = reportRecords.map(record => [
        new Date(record.date).toLocaleDateString('tr-TR'), normalizeTr(record.category), normalizeTr(record.branch),
        normalizeTr(record.actionType), normalizeTr(record.status || 'Cozuldu'), normalizeTr(record.reporterName || 'Yonetici'), normalizeTr(record.notes)
      ]);
      pdfDoc.autoTable({
        startY: 38,
        head: [['Tarih', 'Grup', 'Sube', 'Islem', 'Durum', 'Bildiren', 'Notlar']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: { 0: { cellWidth: 26 } }
      });
      pdfDoc.save(`Okul_Ariza_Raporu_${new Date().toLocaleDateString('tr-TR')}.pdf`);
      setIsGeneratingPdf(false);
    };
    if (!window.jspdf) {
      const script1 = document.createElement('script'); script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script1.onload = () => {
        const script2 = document.createElement('script'); script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.1/jspdf.plugin.autotable.min.js';
        script2.onload = generate; document.body.appendChild(script2);
      }; document.body.appendChild(script1);
    } else generate();
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center font-sans p-6">
        <div className="bg-white border border-red-200 rounded-2xl p-6 max-w-md text-center shadow-lg">
          <p className="text-red-600 font-bold mb-2">Bağlantı Hatası</p>
          <p className="text-sm text-slate-600">{authError}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !user) return <div className="min-h-screen bg-slate-100 flex items-center justify-center font-sans"><Loader2 className="animate-spin text-blue-600 mr-2" /> Bağlanılıyor...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-4 md:p-8 font-sans text-slate-800" onClick={unlockAudio}>

      {viewingImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setViewingImage(null)}>
          <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full transition-colors"><X size={24} /></button>
          <img src={viewingImage} alt="Buyutulmus" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-xl mb-6 flex items-center gap-2 border-b pb-4"><Lock className="text-blue-600" /> Yönetici Girişi</h3>
            <input type="password" value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()} placeholder="****" className="w-full border p-3 rounded-xl mb-4 text-center text-xl tracking-widest focus:ring-2 ring-blue-100 outline-none border-slate-200" autoFocus />
            {pinError && <p className="text-red-500 text-sm mb-4 text-center">Hatalı şifre.</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowPinModal(false)} className="flex-1 p-2 bg-slate-100 rounded-xl font-medium">İptal</button>
              <button onClick={handlePinSubmit} className="flex-1 p-2 bg-blue-600 text-white rounded-xl font-medium">Giriş Yap</button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shrink-0"><School size={28} /></div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              Arıza & Bakım Takip
              {recordCounts.newReq > 0 && <span className="flex h-3 w-3 rounded-full bg-red-500 animate-ping"></span>}
            </h1>
            <p className="text-sm text-slate-500 hidden sm:block">Okul teknik destek sistemi</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {appMode === 'admin' && (
            <button
              onClick={toggleNotifications}
              className={`p-2.5 rounded-xl transition-all border ${notificationsEnabled ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'}`}
              title={notificationsEnabled ? 'Bildirimleri Kapat' : 'Bildirimleri Aç'}
            >
              {notificationsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
          )}
          <button
            onClick={() => appMode === 'teacher' ? setShowPinModal(true) : setAppMode('teacher')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm border shadow-sm ${appMode === 'teacher' ? 'bg-white text-slate-600' : 'bg-slate-800 text-white border-slate-700'}`}
          >
            {appMode === 'teacher' ? <><Lock size={16} /> <span className="hidden sm:inline">Yönetici</span></> : <><Unlock size={16} /> <span className="hidden sm:inline">Öğretmen</span></>}
          </button>
        </div>
      </header>

      {appMode === 'teacher' ? (
        <main className="max-w-xl mx-auto">
          {isTeacherSubmitted ? (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-8 text-center shadow-lg">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4 animate-bounce" />
              <h2 className="text-2xl font-bold text-emerald-800">Talebiniz İletildi!</h2>
              <p className="text-emerald-600">Yönetici bilgilendirildi.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Arıza Bildirim Formu</h2>
              <form onSubmit={handleTeacherSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-bold block mb-1 text-slate-600">Sınıf / Grup</label>
                    <select value={tCategory} onChange={(e) => setTCategory(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl outline-none text-sm font-medium text-slate-700">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-bold block mb-1 text-slate-600">Şube / Mekan</label>
                    {isTOtherCategory ? <input type="text" value={tCustomBranch} onChange={(e) => setTCustomBranch(e.target.value)} required className="w-full p-3 bg-slate-50 border rounded-xl text-sm" /> :
                    <select value={tBranch} onChange={(e) => setTBranch(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl text-sm font-medium text-slate-700">
                      {BRANCHES.map(b => <option key={b} value={b}>{b} Şubesi</option>)}
                    </select>}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1 text-slate-600">Karşılaşılan Sorun</label>
                  <select value={tIssue} onChange={(e) => setTIssue(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl text-sm font-medium text-slate-700">
                    {TEACHER_ISSUES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1 text-slate-600">Adınız Soyadınız</label>
                  <input type="text" value={tName} onChange={(e) => setTName(e.target.value)} required placeholder="Lütfen isminizi girin" className="w-full p-3 bg-slate-50 border rounded-xl text-sm outline-none focus:ring-2 ring-blue-100" />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1 text-slate-600">Açıklama</label>
                  <textarea rows="3" value={tNotes} onChange={(e) => setTNotes(e.target.value)} required placeholder="Sorunu buraya yazın..." className="w-full p-3 bg-slate-50 border rounded-xl text-sm resize-none outline-none focus:ring-2 ring-blue-100" />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-2 text-slate-600">Fotoğraf Ekle (Birden Fazla Seçilebilir)</label>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <Camera className="text-blue-500 mb-1" />
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Fotoğraf Çek</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, setTImages)} />
                    </label>
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <ImageIcon className="text-emerald-500 mb-1" />
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Galeriden Seç</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, setTImages)} />
                    </label>
                  </div>

                  {tImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {tImages.map((img, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 shadow-sm group">
                          <img src={img} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removeImage(idx, setTImages, tImages)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-md shadow-md active:scale-90 transition-all"><X size={14}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 active:scale-95"><Bell size={20} /> Talebi Gönder</button>
              </form>
            </div>
          )}
        </main>
      ) : (
        <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className={`${isMobileFormOpen ? 'fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center' : 'hidden lg:block lg:static'}`}>
            <div className={`bg-white w-full rounded-t-3xl p-6 shadow-2xl ${isMobileFormOpen ? 'max-h-[90vh] overflow-y-auto' : 'lg:rounded-2xl lg:border lg:shadow-sm lg:sticky lg:top-8'}`}>
              <div className="flex justify-between items-center mb-6 border-b pb-3">
                <h2 className="text-lg font-bold flex items-center gap-2 text-blue-700"><PenTool size={20}/> Yönetici Formu</h2>
                {isMobileFormOpen && <button onClick={() => setIsMobileFormOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X size={20}/></button>}
              </div>
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold block mb-1 text-slate-500">Kayıt Tarihi</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-100" required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold block mb-1 text-slate-500">Sınıf Grubu</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm font-medium">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold block mb-1 text-slate-500">Şube</label>
                    {isOtherCategory ? <input type="text" value={customBranch} onChange={(e) => setCustomBranch(e.target.value)} required placeholder="Örn: Lab..." className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm font-medium" /> :
                    <select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm font-medium">
                      {BRANCHES.map(b => <option key={b} value={b}>{b} Şubesi</option>)}
                    </select>}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1 text-slate-500">Yapılan İşlem</label>
                  <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm font-medium">
                    {ACTION_TYPES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-2 text-slate-500">İşlem Durumu</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center justify-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-all ${status === 'Çözüldü' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                      <input type="radio" className="hidden" onChange={() => setStatus('Çözüldü')} checked={status === 'Çözüldü'} /><CheckCircle2 size={16}/> <span className="text-xs font-bold">Çözüldü</span>
                    </label>
                    <label className={`flex items-center justify-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-all ${status === 'Parça Bekliyor' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                      <input type="radio" className="hidden" onChange={() => setStatus('Parça Bekliyor')} checked={status === 'Parça Bekliyor'} /><Clock size={16}/> <span className="text-xs font-bold">Bekliyor</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-2 text-slate-500">Fotoğraf Ekle (Çoklu)</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                     <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                        <Camera className="text-blue-400 mb-1" size={20} />
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Kamera</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, setAImages)} />
                      </label>
                      <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                        <ImageIcon className="text-emerald-400 mb-1" size={20} />
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Dosya</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, setAImages)} />
                      </label>
                  </div>
                  {aImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {aImages.map((img, idx) => (
                        <div key={idx} className="relative aspect-square rounded overflow-hidden border group">
                          <img src={img} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removeImage(idx, setAImages, aImages)} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg shadow-md active:scale-90"><X size={12}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm h-24 resize-none outline-none focus:ring-2 ring-blue-100" placeholder="Detaylar..." required />
                <button type="submit" className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold hover:bg-slate-900 transition-colors shadow-md active:scale-95 mt-2">Kaydı Sisteme Ekle</button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border space-y-6">
              <div className="flex gap-4 border-b">
                <button onClick={() => setActiveTab('list')} className={`pb-3 flex items-center gap-2 font-bold text-sm transition-all ${activeTab === 'list' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  <ClipboardList size={18} /> Talepler & Kayıtlar
                </button>
                <button onClick={() => setActiveTab('report')} className={`pb-3 flex items-center gap-2 font-bold text-sm transition-all ${activeTab === 'report' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  <FileText size={18} /> Rapor Al & İndir
                </button>
              </div>

              {activeTab === 'list' ? (
                <div className="space-y-5">
                  <div className="flex overflow-x-auto gap-2 pb-2 border-b border-slate-50">
                    <button onClick={() => setListFilter('Tümü')} className={`px-4 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all ${listFilter === 'Tümü' ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200'}`}>Tümü ({recordCounts.all})</button>
                    <button onClick={() => setListFilter('Yeni Talep')} className={`px-4 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all ${listFilter === 'Yeni Talep' ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-200' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}>🚨 Yeni ({recordCounts.newReq})</button>
                    <button onClick={() => setListFilter('Parça Bekliyor')} className={`px-4 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all ${listFilter === 'Parça Bekliyor' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200' : 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'}`}>⏳ Bekleyen ({recordCounts.pending})</button>
                    <button onClick={() => setListFilter('Çözüldü')} className={`px-4 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all ${listFilter === 'Çözüldü' ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'}`}>✅ Çözülenler ({recordCounts.resolved})</button>
                  </div>
                  <div className="relative group">
                    <Search className="absolute left-3 top-3 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input type="text" placeholder="Sınıf, sorun veya notlarda arama yapın..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-2 ring-blue-100 border border-transparent transition-all text-sm font-medium" />
                  </div>
                  <div className="space-y-3">
                    {filteredRecords.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <Wrench size={40} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-500 font-bold">Kayıt bulunamadı.</p>
                      </div>
                    ) : filteredRecords.map(r => (
                      <div key={r.id} className={`p-4 rounded-xl border flex gap-4 relative group transition-all ${r.status === 'Yeni Talep' ? 'bg-red-50/40 border-red-100 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-md'}`}>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-[10px] font-extrabold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-600 uppercase">{r.category} - {r.branch}</span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md text-white uppercase tracking-wider ${r.status === 'Yeni Talep' ? 'bg-red-500 animate-pulse' : r.status === 'Parça Bekliyor' ? 'bg-amber-500' : 'bg-emerald-500'}`}>{r.status || 'Çözüldü'}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-800 leading-relaxed"><span className="text-blue-600 font-bold">{r.reporterName || 'Yonetici'}:</span> {r.notes}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-50">
                             <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1"><Calendar size={13}/> {new Date(r.date).toLocaleDateString('tr-TR')}</span>
                             <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1"><Monitor size={13}/> {r.actionType}</span>
                             {r.image && (
                                <div className="flex gap-1">
                                  {Array.isArray(r.image) ? r.image.map((img, i) => (
                                    <button key={i} onClick={() => setViewingImage(img)} className="h-8 w-12 rounded overflow-hidden border border-slate-200 hover:scale-110 transition-transform">
                                      <img src={img} className="w-full h-full object-cover" />
                                    </button>
                                  )) : (
                                    <button onClick={() => setViewingImage(r.image)} className="h-8 w-12 rounded overflow-hidden border border-slate-200 hover:scale-110 transition-transform">
                                      <img src={r.image} className="w-full h-full object-cover" />
                                    </button>
                                  )}
                                </div>
                             )}
                          </div>
                          {(r.status === 'Yeni Talep' || r.status === 'Parça Bekliyor') && (
                            <div className="flex gap-2 mt-4">
                              <button onClick={() => updateStatus(r.id, 'Çözüldü')} className="text-[10px] font-extrabold px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-1">
                                <CheckCircle2 size={12}/> Çözüldü İşaretle
                              </button>
                              {r.status === 'Yeni Talep' && <button onClick={() => updateStatus(r.id, 'Parça Bekliyor')} className="text-[10px] font-extrabold px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-1">
                                <Clock size={12}/> Beklemeye Al
                              </button>}
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleDelete(r.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all self-start" title="Kaydı Sil"><Trash2 size={18}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
                    <div>
                      <label className="text-xs font-extrabold block mb-1.5 text-slate-500 uppercase tracking-wider">Rapor Kategorisi</label>
                      <select value={reportCategory} onChange={(e) => { setReportCategory(e.target.value); setReportBranch('Tümü'); }} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm outline-none focus:ring-2 ring-blue-100">
                        <option value="Tüm Sınıflar">Tüm Sınıflar</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-extrabold block mb-1.5 text-slate-500 uppercase tracking-wider">Şube / Mekan</label>
                      <select value={reportBranch} onChange={(e) => setReportBranch(e.target.value)} disabled={reportCategory === 'Tüm Sınıflar'} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm outline-none disabled:opacity-50 focus:ring-2 ring-blue-100">
                        <option value="Tümü">Tüm Şubeler</option>
                        {BRANCHES.map(b => <option key={b} value={b}>{b} Şubesi</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between items-center border-t border-slate-100 pt-6 gap-4">
                    <div className="text-sm font-bold text-blue-700 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 shadow-sm">
                      🔍 Bulunan Toplam Kayıt Sayısı: {reportRecords.length}
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                      <button onClick={exportToExcel} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-extrabold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95">
                        <Download size={16}/> Excel İndir
                      </button>
                      <button onClick={exportToPDF} disabled={isGeneratingPdf} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl text-xs font-extrabold hover:bg-red-700 shadow-lg shadow-red-200 transition-all active:scale-95 disabled:opacity-50">
                        <FileText size={16}/> {isGeneratingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {!isMobileFormOpen && activeTab === 'list' && (
            <button onClick={() => setIsMobileFormOpen(true)} className="lg:hidden fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-2xl z-[120] active:scale-90 transition-transform flex items-center justify-center animate-bounce">
              <PenTool size={26}/>
            </button>
          )}
        </main>
      )}
    </div>
  );
}
