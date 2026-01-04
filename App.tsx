
import React, { useState, useRef, useCallback } from 'react';
import { ItemStatus, QueueItem, DetectionResult } from './types';
import { detectLicensePlates } from './services/geminiService';
import { 
  CloudArrowUpIcon, 
  SparklesIcon, 
  ArrowDownTrayIcon, 
  ExclamationCircleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  PhotoIcon,
  ArrowsRightLeftIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: File[]) => {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const newItem: QueueItem = {
          id: Math.random().toString(36).substr(2, 9),
          originalUrl: event.target?.result as string,
          processedUrl: null,
          status: ItemStatus.PENDING,
          error: null,
          fileName: file.name
        };
        setQueue(prev => [...prev, newItem]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    handleFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    handleFiles(files);
  };

  const blurImage = useCallback(async (imgSrc: string, detections: DetectionResult[]) => {
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return reject("Canvas not found");
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject("Context not found");

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        detections.forEach(det => {
          const [ymin, xmin, ymax, xmax] = det.box_2d;
          const x = (xmin / 1000) * img.width;
          const y = (ymin / 1000) * img.height;
          const w = ((xmax - xmin) / 1000) * img.width;
          const h = ((ymax - ymin) / 1000) * img.height;

          const padX = w * 0.25;
          const padY = h * 0.25;
          const rectX = Math.max(0, x - padX);
          const rectY = Math.max(0, y - padY);
          const rectW = Math.min(img.width - rectX, w + 2 * padX);
          const rectH = Math.min(img.height - rectY, h + 2 * padY);

          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) return;

          const pixelScale = 0.05; 
          tempCanvas.width = Math.max(1, rectW * pixelScale);
          tempCanvas.height = Math.max(1, rectH * pixelScale);
          tempCtx.imageSmoothingEnabled = false;
          tempCtx.drawImage(canvas, rectX, rectY, rectW, rectH, 0, 0, tempCanvas.width, tempCanvas.height);
          
          ctx.save();
          ctx.beginPath();
          ctx.rect(rectX, rectY, rectW, rectH);
          ctx.clip();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, rectX, rectY, rectW, rectH);
          ctx.filter = 'blur(12px) brightness(0.9)';
          ctx.drawImage(canvas, rectX, rectY, rectW, rectH, rectX, rectY, rectW, rectH);
          ctx.restore();
        });
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = imgSrc;
    });
  }, []);

  const processSingleItem = async (itemId: string) => {
    const item = queue.find(i => i.id === itemId);
    if (!item || item.status === ItemStatus.COMPLETED) return;
    setQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: ItemStatus.DETECTING, error: null } : i));
    try {
      const base64Data = item.originalUrl.split(',')[1];
      const detections = await detectLicensePlates(base64Data);
      if (detections.length === 0) {
        setQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: ItemStatus.ERROR, error: "Не найден" } : i));
        return;
      }
      setQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: ItemStatus.BLURRING } : i));
      const result = await blurImage(item.originalUrl, detections);
      setQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: ItemStatus.COMPLETED, processedUrl: result } : i));
    } catch (err) {
      setQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: ItemStatus.ERROR, error: "Ошибка" } : i));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingItems = queue.filter(i => i.status === ItemStatus.PENDING || i.status === ItemStatus.ERROR);
    for (const item of pendingItems) {
      await processSingleItem(item.id);
    }
    setIsProcessingAll(false);
  };

  const triggerDownload = (url: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `blurred_${fileName}`;
    link.click();
  };

  const downloadAllFiles = () => {
    const completedItems = queue.filter(i => i.status === ItemStatus.COMPLETED && i.processedUrl);
    completedItems.forEach((item, index) => {
      setTimeout(() => triggerDownload(item.processedUrl!, item.fileName), index * 300);
    });
  };

  const removeItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const completedCount = queue.filter(i => i.status === ItemStatus.COMPLETED).length;
  const totalCount = queue.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div 
      className={`min-h-screen bg-slate-950 text-slate-100 transition-colors duration-500 ${isDragging ? 'bg-indigo-950/30' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-20">
        <header className="mb-16 text-center space-y-6">
          <div className="inline-block p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20 shadow-2xl animate-pulse">
            <SparklesIcon className="w-12 h-12 text-indigo-400" />
          </div>
          <h1 className="text-6xl md:text-7xl font-black tracking-tighter">
            AutoBlur<span className="text-indigo-500">.</span>ai
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-xl font-medium leading-relaxed">
            Автоматическое размытие номерных знаков с помощью AI. 
            Ваши фото остаются только в вашем браузере.
          </p>
          
          {isDragging && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-600/10 backdrop-blur-md border-8 border-dashed border-indigo-500/50 pointer-events-none">
              <div className="bg-slate-900 p-12 rounded-[3rem] shadow-2xl flex flex-col items-center border border-white/10">
                <ArrowUpTrayIcon className="w-24 h-24 text-indigo-400 mb-6 animate-bounce" />
                <p className="text-3xl font-black uppercase tracking-widest">Бросайте сюда</p>
              </div>
            </div>
          )}
        </header>

        <main className="space-y-10">
          {/* Progress Section */}
          {totalCount > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-end text-sm font-bold uppercase tracking-widest text-slate-500">
                <span>Прогресс обработки</span>
                <span className="text-indigo-400">{Math.round(progressPercent)}%</span>
              </div>
              <div className="bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%] animate-[gradient_3s_linear_infinite] rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between sticky top-8 z-40 bg-slate-900/60 backdrop-blur-2xl p-4 md:p-6 rounded-[2.5rem] border border-white/5 shadow-2xl shadow-black/50">
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 px-10 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 active:scale-95"
              >
                <CloudArrowUpIcon className="w-6 h-6" />
                ЗАГРУЗИТЬ
              </button>
              
              {queue.length > 0 && (
                <button 
                  onClick={processAll}
                  disabled={isProcessingAll || queue.every(i => i.status === ItemStatus.COMPLETED)}
                  className="flex-1 md:flex-none bg-white text-slate-950 disabled:opacity-50 hover:bg-slate-200 font-black py-4 px-10 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  {isProcessingAll ? <ArrowPathIcon className="w-6 h-6 animate-spin" /> : <SparklesIcon className="w-6 h-6" />}
                  ЗАПУСТИТЬ
                </button>
              )}
            </div>

            {completedCount > 0 && (
              <button 
                onClick={downloadAllFiles}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 px-10 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 active:scale-95"
              >
                <ArrowDownTrayIcon className="w-6 h-6" />
                СКАЧАТЬ ВСЕ ({completedCount})
              </button>
            )}
          </div>

          {/* Queue Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {queue.length === 0 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="col-span-full py-40 border-4 border-dashed border-slate-900 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-500/5 hover:border-indigo-500/30 transition-all group"
              >
                <div className="p-8 bg-slate-900 rounded-[2rem] mb-8 group-hover:scale-110 transition-transform border border-white/5">
                  <PhotoIcon className="w-16 h-16 text-slate-700 group-hover:text-indigo-400" />
                </div>
                <p className="text-2xl text-slate-500 font-black uppercase tracking-tighter">Нажмите или перетащите</p>
                <p className="text-slate-600 mt-2 font-medium italic">Поддерживаются JPG, PNG, WebP</p>
              </div>
            ) : (
              queue.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => setPreviewItem(item)}
                  className={`group relative bg-slate-900/50 rounded-[2rem] overflow-hidden border-2 transition-all duration-500 cursor-pointer ${item.status === ItemStatus.COMPLETED ? 'border-emerald-500/40 shadow-emerald-500/5' : 'border-slate-800 hover:border-indigo-500/50 shadow-2xl'}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-black">
                    <img 
                      src={item.processedUrl || item.originalUrl} 
                      alt={item.fileName} 
                      className={`w-full h-full object-cover transition-all duration-700 ${item.status === ItemStatus.DETECTING || item.status === ItemStatus.BLURRING ? 'scale-125 blur-xl opacity-30' : 'opacity-100 group-hover:scale-110'}`}
                    />
                    
                    {/* Status Overlays */}
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                      {(item.status === ItemStatus.DETECTING || item.status === ItemStatus.BLURRING) && (
                        <div className="bg-slate-950/80 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 flex flex-col items-center gap-4 shadow-2xl">
                          <ArrowPathIcon className="w-10 h-10 text-indigo-400 animate-spin" />
                          <span className="text-xs font-black text-white uppercase tracking-[0.3em]">Магия AI...</span>
                        </div>
                      )}
                      {item.status === ItemStatus.ERROR && (
                        <div className="bg-red-950/90 backdrop-blur-xl px-6 py-3 rounded-2xl flex items-center gap-3 border border-red-500/50 shadow-2xl">
                          <ExclamationCircleIcon className="w-6 h-6 text-red-400" />
                          <span className="text-sm font-black text-white uppercase">{item.error}</span>
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={(e) => removeItem(item.id, e)}
                      className="absolute top-4 left-4 p-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all border border-red-500/20 z-20"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                    
                    {item.status === ItemStatus.COMPLETED && (
                      <div className="absolute top-4 right-4 bg-emerald-500 text-white rounded-full p-2 shadow-2xl border-4 border-slate-900 z-20">
                        <CheckCircleIcon className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex items-center justify-between bg-slate-900/80 border-t border-white/5">
                    <div className="flex flex-col min-w-0">
                      <p className="text-xs font-black text-slate-300 truncate uppercase tracking-widest">
                        {item.fileName}
                      </p>
                      <span className="text-[10px] font-bold text-slate-600 mt-1">ОБРАБОТАНО</span>
                    </div>
                    {item.status === ItemStatus.COMPLETED && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); triggerDownload(item.processedUrl!, item.fileName); }}
                        className="p-3 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white rounded-2xl transition-all shadow-inner"
                      >
                        <ArrowDownTrayIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>

        {/* Modal Preview */}
        {previewItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-slate-950/98 backdrop-blur-3xl transition-all duration-300">
            <div className="relative max-w-7xl w-full h-full flex flex-col bg-slate-900 rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between p-8 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-500/20 rounded-2xl">
                    <ArrowsRightLeftIcon className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">{previewItem.fileName}</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Предпросмотр результата</p>
                  </div>
                </div>
                <button onClick={() => setPreviewItem(null)} className="p-4 hover:bg-slate-800 rounded-2xl transition-all active:scale-90 group">
                  <XMarkIcon className="w-8 h-8 text-slate-400 group-hover:text-white" />
                </button>
              </div>
              
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 md:p-10 overflow-auto bg-black/40">
                <div className="flex flex-col gap-4">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-2">Оригинал</span>
                  <div className="relative flex-1 rounded-[2rem] overflow-hidden border border-white/5 bg-slate-950 shadow-inner">
                    <img src={previewItem.originalUrl} alt="Original" className="w-full h-full object-contain" />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] ml-2">Результат AI</span>
                  <div className="relative flex-1 rounded-[2rem] overflow-hidden border-2 border-indigo-500/30 bg-slate-950 shadow-2xl">
                    <img src={previewItem.processedUrl || previewItem.originalUrl} alt="Processed" className="w-full h-full object-contain" />
                  </div>
                </div>
              </div>

              <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-900/80 border-t border-slate-800">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-xs font-bold uppercase tracking-widest italic">Безопасная обработка завершена</p>
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                  <button 
                    onClick={() => setPreviewItem(null)}
                    className="flex-1 md:flex-none px-10 py-4 rounded-2xl border border-slate-700 hover:bg-slate-800 text-sm font-black uppercase tracking-widest transition-all"
                  >
                    Закрыть
                  </button>
                  {previewItem.status === ItemStatus.COMPLETED && (
                     <button 
                      onClick={() => triggerDownload(previewItem.processedUrl!, previewItem.fileName)}
                      className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 px-12 rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-indigo-600/40 active:scale-95 text-sm uppercase tracking-widest"
                    >
                      <ArrowDownTrayIcon className="w-6 h-6" />
                      Скачать
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          multiple
          onChange={handleFileChange} 
        />
        <canvas ref={canvasRef} className="hidden" />
        
        <footer className="mt-32 py-16 border-t border-white/5 text-center md:text-left">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12">
            <div className="space-y-4 max-w-sm">
              <h4 className="text-white font-black text-2xl tracking-tighter italic">AutoBlur Pro<span className="text-indigo-500">.</span></h4>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Интеллектуальная защита приватности. Мы используем передовые модели Gemini для поиска объектов, 
                но само размытие происходит локально на вашем устройстве.
              </p>
            </div>
            <div className="flex flex-wrap justify-center md:justify-end gap-10 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">
              <div className="flex flex-col gap-3">
                <span className="text-slate-400">Технологии</span>
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> Gemini Vision</span>
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> HTML5 Canvas</span>
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-slate-400">Безопасность</span>
                <span className="flex items-center gap-2 text-emerald-500/70"><CheckCircleIcon className="w-4 h-4" /> No Cloud Upload</span>
                <span className="flex items-center gap-2 text-emerald-500/70"><CheckCircleIcon className="w-4 h-4" /> HTTPS Only</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
