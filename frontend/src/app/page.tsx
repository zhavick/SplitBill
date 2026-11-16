"use client";

import React, { useEffect, useState } from "react";
import { useSplitBillStore } from "@/lib/store";
import { HomeLanding } from "@/components/home-landing";
import { CameraViewfinder } from "@/components/camera-viewfinder";
import { ReviewStruk } from "@/components/review-struk";
import { ItemTagging } from "@/components/item-tagging";
import { SettlementSummary } from "@/components/settlement-summary";
import { WifiOff } from "lucide-react";

export default function Home() {
  const { currentStep } = useSplitBillStore();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col relative">
      <main className="flex flex-col flex-1 relative overflow-hidden bg-slate-50">
        {/* Offline Toast Banner */}
        {isOffline && (
          <div className="bg-amber-600 text-white text-[11px] font-semibold py-1 px-3 text-center flex items-center justify-center gap-1.5 z-50">
            <WifiOff size={13} />
            Mode Offline Aktif • Draft struk akan tersimpan di penyimpanan lokal PWA
          </div>
        )}

        {/* Screen Steps */}
        {currentStep === 0 && <HomeLanding />}
        {currentStep === 1 && <CameraViewfinder />}
        {currentStep === 2 && <ReviewStruk />}
        {currentStep === 3 && <ItemTagging />}
        {currentStep === 4 && <SettlementSummary />}
      </main>
    </div>
  );
}
