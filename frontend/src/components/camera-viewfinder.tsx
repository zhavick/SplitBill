"use client";

import React, { useState, useRef, useEffect } from "react";
import { Camera, Image as ImageIcon, CheckCircle, Plus, Trash2, ArrowRight, ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import { useSplitBillStore } from "@/lib/store";
import { uploadReceiptShot, processReceiptOcr } from "@/lib/api";

export function CameraViewfinder() {
  const {
    shots,
    addShot,
    removeShot,
    clearShots,
    setStep,
    setReceiptData,
    transactionId,
    setTransactionId,
    setIsProcessing,
    isProcessing,
  } = useSplitBillStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmDialogRef = useRef<HTMLDialogElement | null>(null);

  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [latestDataUrl, setLatestDataUrl] = useState<string | null>(null);

  // Inisialisasi kamera belakang
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        setCameraError(null);
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setStreamActive(true);
          }
        } else {
          setCameraError("Kamera tidak didukung di browser ini. Silakan unggah foto struk.");
        }
      } catch (err: any) {
        console.warn("Camera init failed:", err);
        setCameraError("Tidak dapat mengakses kamera. Silakan pilih opsi unggah foto dari galeri.");
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Tangkap gambar dari video feed
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          addShot(dataUrl, blob);
          setLatestDataUrl(dataUrl);
          confirmDialogRef.current?.showModal();
        }
      },
      "image/jpeg",
      0.9
    );
  };

  // Upload file alternatif
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        addShot(dataUrl, file);
        setLatestDataUrl(dataUrl);
        confirmDialogRef.current?.showModal();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Proses OCR ke Backend
  const handleProcessOcr = async () => {
    confirmDialogRef.current?.close();
    if (shots.length === 0) return;

    setIsProcessing(true);
    try {
      let activeTxId = transactionId;

      // 1. Upload semua shot ke backend secara berurutan
      for (const shot of shots) {
        let blob = shot.blob;
        if (!blob) {
          // Buat blob dari dataUrl
          const res = await fetch(shot.dataUrl);
          blob = await res.blob();
        }

        const uploadRes = await uploadReceiptShot({
          transactionId: activeTxId || undefined,
          shotOrder: shot.shotOrder,
          file: blob,
        });

        if (!activeTxId) {
          activeTxId = uploadRes.data.transactionId;
          setTransactionId(activeTxId);
        }
      }

      if (!activeTxId) {
        throw new Error("Gagal memperoleh ID transaksi struk.");
      }

      // 2. Jalankan Vision OCR Gemini di backend
      const ocrResult = await processReceiptOcr(activeTxId);
      const data = ocrResult.data;

      setReceiptData({
        transactionId: data.transactionId,
        merchantName: data.merchantName,
        transactionDate: data.transactionDate,
        taxAmount: data.taxAmount,
        serviceCharge: data.serviceCharge,
        discountAmount: data.discountAmount,
        roundingAmount: data.roundingAmount,
        finalTotal: data.finalTotal,
        hasDiscrepancy: data.hasDiscrepancy,
        items: data.items.map((it) => ({
          id: it.id,
          itemName: it.itemName,
          quantity: it.quantity,
          itemPrice: it.itemPrice,
          totalPrice: it.totalPrice,
        })),
      });

      // Lanjut ke Step 2 (Review)
      setStep(2);
    } catch (err: any) {
      console.error("OCR process error:", err);
      alert(err.message || "Gagal memproses struk dengan OCR. Silakan coba lagi.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-black text-white relative overflow-hidden">
      {/* Top Bar Header */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep(0)}
            className="p-1.5 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
            title="Kembali ke Beranda"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Scan Struk Belanja
            </h1>
            <p className="text-[11px] text-slate-300">
              {shots.length === 0
                ? "Arahkan struk dalam bingkai panduan"
                : `Telah diambil: ${shots.length} bagian struk`}
            </p>
          </div>
        </div>

        {shots.length > 0 && (
          <span className="bg-blue-600/90 text-white font-medium text-xs px-3 py-1 rounded-full shadow-md">
            Shot {shots.length}/5
          </span>
        )}
      </div>

      {/* Viewfinder Video Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {streamActive ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-center p-6 max-w-xs">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Camera size={32} />
            </div>
            <p className="text-sm text-slate-300 mb-4">
              {cameraError || "Menyiapkan sensor kamera..."}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <ImageIcon size={18} />
              Pilih Foto Struk dari Galeri
            </button>
          </div>
        )}

        {/* Framing Overlay Guide */}
        <div className="absolute inset-8 pointer-events-none border-2 border-dashed border-white/50 rounded-2xl flex flex-col justify-between p-3">
          <div className="flex justify-between">
            <div className="w-6 h-6 border-t-4 border-l-4 border-blue-400 -mt-1 -ml-1 rounded-tl" />
            <div className="w-6 h-6 border-t-4 border-r-4 border-blue-400 -mt-1 -mr-1 rounded-tr" />
          </div>
          <div className="text-center">
            <span className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-slate-300">
              Pastikan teks struk tajam & tidak terpotong
            </span>
          </div>
          <div className="flex justify-between">
            <div className="w-6 h-6 border-b-4 border-l-4 border-blue-400 -mb-1 -ml-1 rounded-bl" />
            <div className="w-6 h-6 border-b-4 border-r-4 border-blue-400 -mb-1 -mr-1 rounded-br" />
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Captured Thumbnails Horizontal Carousel */}
      {shots.length > 0 && (
        <div className="bg-slate-900/90 backdrop-blur-md py-2 px-4 flex items-center gap-2 overflow-x-auto no-scrollbar z-10 border-t border-slate-800">
          <span className="text-[11px] text-slate-400 shrink-0 font-medium">Shots:</span>
          {shots.map((s) => (
            <div key={s.shotOrder} className="relative group shrink-0">
              <img
                src={s.dataUrl}
                alt={`Shot ${s.shotOrder}`}
                className="w-14 h-14 object-cover rounded-lg border-2 border-blue-500 shadow"
              />
              <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-[9px] font-bold px-1 rounded text-white">
                #{s.shotOrder}
              </span>
              <button
                onClick={() => removeShot(s.shotOrder)}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 shadow hover:bg-red-700"
                title="Hapus shot"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {shots.length < 5 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:text-white shrink-0 text-xs"
            >
              <Plus size={16} />
              <span className="text-[9px] mt-0.5">Tambah</span>
            </button>
          )}
        </div>
      )}

      {/* Bottom Shutter Controls */}
      <div className="bg-black/95 p-5 pb-8 flex items-center justify-around z-20">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Galeri button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white transition"
          title="Buka Galeri"
        >
          <ImageIcon size={22} />
        </button>

        {/* Shutter Capture Button */}
        <button
          onClick={capturePhoto}
          disabled={isProcessing}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-95 transition"
        >
          <div className="w-full h-full rounded-full bg-white hover:bg-blue-50 transition" />
        </button>

        {/* Finish & Process OCR button */}
        {shots.length > 0 ? (
          <button
            onClick={handleProcessOcr}
            disabled={isProcessing}
            className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/40 hover:bg-blue-700 transition"
            title="Selesai & Ekstraksi OCR"
          >
            {isProcessing ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <ArrowRight size={22} />
            )}
          </button>
        ) : (
          <div className="w-12 h-12" />
        )}
      </div>

      {/* Modern Dialog Modal: Multi-Shot Continuation Prompt */}
      <dialog
        ref={confirmDialogRef}
        aria-labelledby="dialog-title"
        className="w-[90%] max-w-sm rounded-2xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={28} />
          </div>
          <h2 id="dialog-title" className="text-lg font-bold text-slate-900">
            Foto Struk Berhasil Diambil!
          </h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Apakah struk belanja ini panjang dan membutuhkan foto sambungan berikutnya?
          </p>

          {latestDataUrl && (
            <div className="w-full h-32 rounded-xl overflow-hidden mb-4 border border-slate-200 shadow-inner bg-slate-100">
              <img
                src={latestDataUrl}
                alt="Preview Struk Terakhir"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            {shots.length < 5 && (
              <button
                onClick={() => confirmDialogRef.current?.close()}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                <Plus size={18} />
                + Ambil Shot Lanjutan (Struk Panjang)
              </button>
            )}

            <button
              onClick={handleProcessOcr}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Mengekstrak Item & Pajak...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Selesai & Proses OCR
                </>
              )}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
