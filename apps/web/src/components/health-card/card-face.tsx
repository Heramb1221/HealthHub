"use client";

import * as React from "react";
import {
  HeartPulse,
  ShieldCheck,
  Scissors,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from "lucide-react";

import { QrCode } from "@/components/health-card/qr-code";
import { DemoTag } from "@/components/status/demo-tag";
import type { HealthCard } from "@/lib/api/types";

// Helper to format ISO date to DD/MM/YYYY
function formatNumericDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// Translate gender to bilingual display
function formatGenderBilingual(gender: string | null | undefined): string {
  if (!gender) return "—";
  const g = gender.toLowerCase();
  if (g === "male") return "MALE / पुरुष";
  if (g === "female") return "FEMALE / महिला";
  if (g === "other") return "OTHER / अन्य";
  return gender.toUpperCase();
}

/** Realistic guilloche wave security background pattern */
function GuillochePattern() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full opacity-[0.06]"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
    >
      <defs>
        <pattern id="guilloche" width="60" height="60" patternUnits="userSpaceOnUse">
          <path
            d="M0 30 Q15 0 30 30 T60 30 M0 15 Q15 45 30 15 T60 15"
            fill="none"
            stroke="#0e3a6c"
            strokeWidth="0.75"
          />
          <circle cx="30" cy="30" r="20" fill="none" stroke="#0e3a6c" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#guilloche)" />
    </svg>
  );
}


/** Hologram security badge */
function HologramSeal() {
  return (
    <div
      aria-hidden="true"
      className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-400/80 bg-gradient-to-tr from-amber-200 via-rose-200 to-sky-300 shadow-xs"
      title="Authentic Sehat Med Credential"
    >
      <div className="flex flex-col items-center text-[6px] font-black tracking-tighter text-slate-800 uppercase leading-none">
        <ShieldCheck className="size-3 text-amber-900" />
        <span>SECURE</span>
      </div>
    </div>
  );
}

/** Vector Code128-style linear barcode */
function LinearBarcode({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-4 items-end gap-[1.5px] px-1" aria-hidden="true">
        {Array.from({ length: 42 }).map((_, i) => {
          const isThick = (i * 7 + 3) % 4 === 0;
          const isMedium = (i * 3 + 1) % 3 === 0;
          const h = (i * 5) % 7 === 0 ? "h-3" : "h-4";
          return (
            <div
              key={i}
              className={`bg-slate-900 ${h} ${isThick ? "w-[2px]" : isMedium ? "w-[1.2px]" : "w-[0.8px]"}`}
            />
          );
        })}
      </div>
      <p className="font-mono text-[7.5px] font-semibold tracking-widest text-slate-600 leading-tight">{code}</p>
    </div>
  );
}

/* =========================================================================
 * 1. CARD FRONT (SEHAT MED IDENTITY FACE)
 * ========================================================================= */
export function CardFront({ card, className }: { card: HealthCard; className?: string }) {
  const initials = (card.fullName || "SM")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-300/90 bg-gradient-to-br from-[#f8fafc] via-[#edf4fa] to-[#e2eaf4] p-3 text-slate-900 shadow-md select-none print:m-0 print:rounded-lg print:border-slate-800 print:shadow-none ${
        className ?? "aspect-[85.6/54] w-full max-w-[480px] min-h-[270px]"
      }`}
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <GuillochePattern />

      {/* TOP HEADER: Sehat Med Official Brand with Tricolor accent */}
      <div className="relative z-10 space-y-1">
        <div className="flex items-center justify-between gap-2 border-b border-slate-300/80 pb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Sehat Med"
              className="size-5.5 rounded object-contain shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="min-w-0 leading-none">
              <p className="text-[10px] font-black tracking-wide text-[#0e3a6c] uppercase truncate">
                SEHAT MED DIGITAL HEALTH CARD
              </p>
              <p className="text-[7.5px] font-semibold text-slate-500 truncate">
                सेहत मेड डिजिटल कार्ड · Bharat ka apna Sathi
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <span className="inline-block rounded-xs bg-[#0e3a6c] px-1.5 py-0.5 text-[7.5px] font-bold tracking-wider text-white uppercase">
              SMART HEALTH ID
            </span>
          </div>
        </div>

        {/* Tricolor Ribbon Bar */}
        <div className="flex h-[2px] w-full overflow-hidden rounded-full">
          <div className="w-1/3 bg-[#ff9933]" />
          <div className="w-1/3 bg-slate-300" />
          <div className="w-1/3 bg-[#138808]" />
        </div>
      </div>

      {/* CARD BODY: Photo and Demographic Details */}
      <div className="relative z-10 my-auto grid grid-cols-12 items-center gap-2.5 py-1">
        {/* Left Column: Passport Photo & Security Seal */}
        <div className="col-span-4 flex flex-col items-center gap-1">
          <div className="flex w-full items-center justify-end px-1">
            <HologramSeal />
          </div>

          {/* Photo Frame */}
          <div className="relative flex aspect-[35/42] w-[68px] flex-col items-center justify-center overflow-hidden rounded-xs border border-slate-400 bg-white shadow-xs">
            <div className="flex size-full flex-col items-center justify-center bg-slate-100 text-slate-500">
              <div className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                {initials}
              </div>
              <span className="mt-0.5 text-[6.5px] font-semibold tracking-wider text-slate-400 uppercase">
                PHOTO / फोटो
              </span>
            </div>
            <div className="absolute right-0 bottom-0 left-0 bg-[#0e3a6c]/90 py-[1px] text-center text-[5.5px] font-bold text-white uppercase">
              VERIFIED
            </div>
          </div>
        </div>

        {/* Right Column: Cardholder Information */}
        <div className="col-span-8 space-y-1 pl-0.5 text-[9.5px]">
          {/* Health ID in monospace badge */}
          <div className="rounded-xs border border-[#0e3a6c]/25 bg-[#0e3a6c]/8 px-1.5 py-0.5">
            <p className="text-[6.5px] font-bold tracking-wider text-[#0e3a6c] uppercase">
              स्वास्थ्य पहचान संख्या / HEALTH ID NO.
            </p>
            <p className="font-mono text-[11px] font-black tracking-widest text-[#0e3a6c] truncate">
              {card.healthId || "HH-0000-0000"}
            </p>
          </div>

          {/* Full Name */}
          <div className="leading-tight">
            <p className="text-[6.5px] font-bold tracking-wide text-slate-500 uppercase">नाम / NAME</p>
            <p className="text-[11px] font-black tracking-wide text-slate-900 uppercase truncate" title={card.fullName}>
              {card.fullName || "CARDHOLDER NAME"}
            </p>
          </div>

          {/* DOB & Gender Row */}
          <div className="grid grid-cols-2 gap-1 leading-tight">
            <div className="min-w-0">
              <p className="text-[6.5px] font-bold tracking-wide text-slate-500 uppercase">जन्म तिथि / D.O.B</p>
              <p className="font-mono text-[9px] font-bold text-slate-800">
                {formatNumericDate(card.dateOfBirth)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[6.5px] font-bold tracking-wide text-slate-500 uppercase">लिंग / GENDER</p>
              <p className="text-[8.5px] font-bold text-slate-800 truncate">
                {formatGenderBilingual(card.gender)}
              </p>
            </div>
          </div>

          {/* Blood Group & Phone */}
          <div className="grid grid-cols-2 items-center gap-1 leading-tight">
            <div>
              <p className="text-[6.5px] font-bold tracking-wide text-slate-500 uppercase">रक्त समूह / BLOOD</p>
              <span className="inline-flex items-center gap-1 rounded-xs bg-rose-700 px-1 py-0.5 text-[8.5px] font-black text-white">
                <HeartPulse className="size-2.5" />
                {card.bloodGroup || "O+"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[6.5px] font-bold tracking-wide text-slate-500 uppercase">दूरभाष / MOBILE</p>
              <p className="font-mono text-[8.5px] font-semibold text-slate-800 truncate">
                {card.phone || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Digital Signature & Issue Notice */}
      <div className="relative z-10 flex items-end justify-between border-t border-slate-300/80 pt-1 text-[7px] text-slate-600 leading-tight">
        <div>
          <p className="font-semibold text-slate-700">
            जारी / ISSUED: {formatNumericDate(card.issuedAt)}
          </p>
          {card.isDemo ? (
            <p className="flex items-center gap-1 font-bold text-purple-700">
              <DemoTag /> DEMO CARD
            </p>
          ) : (
            <p className="text-[6px] text-slate-500">SEHAT MED HEALTH NETWORK</p>
          )}
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1 font-mono text-[7px] font-bold text-emerald-800">
            <CheckCircle2 className="size-2.5 text-emerald-600" />
            <span>Digitally Verified</span>
          </div>
          <p className="border-t border-slate-400/50 pt-0.5 text-[6px] font-medium tracking-tight text-slate-500 uppercase">
            प्राधिकृत हस्ताक्षर / AUTHORIZED SIGNATURE
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * 2. CARD BACK (EMERGENCY QR & CLINICAL NOTICE)
 * ========================================================================= */
export function CardBack({ card, className }: { card: HealthCard; className?: string }) {
  const qrUrl =
    card.qr?.url ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/qr/${card.healthId}`
      : `http://localhost:3000/qr/${card.healthId}`);

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-300/90 bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900 shadow-md select-none print:m-0 print:rounded-lg print:border-slate-800 print:shadow-none ${
        className ?? "aspect-[85.6/54] w-full max-w-[480px] min-h-[270px]"
      }`}
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* MAGNETIC STRIPE */}
      <div className="h-6 w-full bg-[#181d24] border-b border-black/40 flex items-center justify-between px-3 text-[7px] font-mono tracking-widest text-slate-400">
        <span>SEHAT MED DIGITAL HEALTH CARD</span>
        <span>ISO/IEC 7810 CR80</span>
      </div>

      <GuillochePattern />

      {/* MAIN BACK CONTENT */}
      <div className="relative z-10 my-auto grid grid-cols-12 items-center gap-2 px-3 py-1">
        {/* QR Code Column */}
        <div className="col-span-5 flex flex-col items-center text-center">
          <div className="rounded-xs border border-slate-400/80 bg-white p-1 shadow-xs">
            <QrCode
              value={qrUrl}
              label={`Emergency QR Code for ${card.fullName || card.healthId}`}
              className="size-[78px]"
            />
          </div>
          <div className="mt-1 leading-tight">
            <p className="text-[7.5px] font-black tracking-tight text-[#0e3a6c] uppercase">
              आपातकालीन स्कैन
            </p>
            <p className="text-[6px] font-semibold text-slate-500 uppercase">
              SCAN FOR EMERGENCY
            </p>
          </div>
        </div>

        {/* Emergency Info & Instructions Column */}
        <div className="col-span-7 space-y-1 text-[8px]">
          {/* Emergency Contacts */}
          <div className="rounded-xs border border-rose-200 bg-rose-50/90 p-1 text-rose-950">
            <div className="flex items-center gap-1 text-[6.5px] font-black uppercase text-rose-900">
              <AlertCircle className="size-2 text-rose-700" />
              <span>आपातकालीन संपर्क / EMERGENCY CONTACT</span>
            </div>
            <div className="mt-0.5 leading-tight font-medium">
              <p className="font-bold text-[8.5px] truncate">
                {card.emergencyContactName || "Nominated Kin / Guardian"}
              </p>
              <p className="font-mono text-[8px] font-semibold text-rose-800">
                {card.emergencyContactPhone || "+91 112 (National Emergency)"}
              </p>
            </div>
          </div>

          {/* National Helplines */}
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="rounded-xs border border-slate-300 bg-white p-0.5">
              <p className="text-[6px] font-bold text-slate-500 uppercase">AMBULANCE</p>
              <p className="font-mono text-[8.5px] font-black text-rose-700">108</p>
            </div>
            <div className="rounded-xs border border-slate-300 bg-white p-0.5">
              <p className="text-[6px] font-bold text-slate-500 uppercase">EMERGENCY</p>
              <p className="font-mono text-[8.5px] font-black text-slate-900">112</p>
            </div>
            <div className="rounded-xs border border-slate-300 bg-white p-0.5">
              <p className="text-[6px] font-bold text-slate-500 uppercase">HEALTH LINE</p>
              <p className="font-mono text-[8.5px] font-black text-[#0e3a6c]">1075</p>
            </div>
          </div>

          {/* Legal / Notice */}
          <div className="space-y-0.5 text-[6px] leading-tight text-slate-600">
            <p>
              • <strong>Hospital Access:</strong> Instant scan provides authenticated triage data.
            </p>
            <p>
              • <strong>If found:</strong> Return to any Hospital/PHC or contact help@sehatmed.in.
            </p>
          </div>
        </div>
      </div>

      {/* FOOTER: Barcode & Serial */}
      <div className="relative z-10 flex items-center justify-between border-t border-slate-300/80 bg-white/70 px-3 py-1">
        <div className="text-[6px] text-slate-500 leading-tight">
          <p className="font-bold text-slate-700 uppercase">Sehat Med Health Network</p>
          <p>www.sehatmed.in · Toll-Free: 1800-11-4477</p>
        </div>
        <LinearBarcode code={card.healthId || "HH-CARD-2026"} />
      </div>
    </div>
  );
}

/* =========================================================================
 * 3. PRINTABLE SHEET (STANDARD CR80 WALLET CARD WITH SCISSOR CUT MARKS)
 * ========================================================================= */
export function PrintableCardSheet({ card }: { card: HealthCard }) {
  return (
    <div className="printable-pan-sheet w-full py-2 text-center">
      {/* Instructions header (hidden in final print) */}
      <div className="mx-auto mb-4 max-w-xl rounded-md border border-info/30 bg-info-surface p-3 text-left text-xs text-info print:hidden">
        <p className="font-bold">🖨️ Wallet Card Print & Cut Guide:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>Click <strong>Print Card</strong> to print on standard A4 or card paper at 100% scale.</li>
          <li>In the print dialog, choose your printer or select <strong>Save as PDF</strong>.</li>
          <li>Cut along the dashed lines (✂) and fold down the center for a standard 85.6mm × 54mm wallet size!</li>
        </ol>
      </div>

      {/* CR80 Cut Sheet Container */}
      <div className="mx-auto inline-block text-left">
        <div className="relative inline-flex flex-col items-center rounded-lg border-2 border-dashed border-slate-400 bg-white p-4 shadow-sm print:border-slate-800 print:p-2 print:shadow-none">
          {/* Top Indicator */}
          <div className="mb-2 flex w-full items-center justify-between text-[10px] font-mono font-bold text-slate-500">
            <span className="flex items-center gap-1">
              <Scissors className="size-3.5" /> ✂ CUT ALONG DOTTED LINE
            </span>
            <span className="font-sans font-semibold text-slate-600">
              CR80 WALLET SIZE (85.6 mm × 54.0 mm)
            </span>
          </div>

          {/* Front and Back */}
          <div className="flex flex-col items-center gap-4 sm:flex-row print:flex-row print:gap-4">
            {/* FRONT */}
            <div className="flex flex-col items-center">
              <span className="mb-1 text-[9px] font-bold text-slate-500 tracking-wider uppercase print:hidden">
                FRONT FACE / सम्मुख भाग
              </span>
              <div className="w-[320px] sm:w-[360px] print:w-[85.6mm] print:h-[54mm]">
                <CardFront card={card} className="w-full" />
              </div>
            </div>

            {/* FOLD LINE */}
            <div className="relative flex flex-col items-center justify-center text-slate-400 print:flex">
              <div className="hidden h-full border-r-2 border-dashed border-slate-400 sm:block print:block" />
              <div className="my-1 flex items-center gap-1 text-[8px] font-bold tracking-widest text-slate-500 uppercase sm:[writing-mode:vertical-rl]">
                <span>✂ FOLD HERE ✂</span>
              </div>
              <div className="hidden h-full border-r-2 border-dashed border-slate-400 sm:block print:block" />
            </div>

            {/* BACK */}
            <div className="flex flex-col items-center">
              <span className="mb-1 text-[9px] font-bold text-slate-500 tracking-wider uppercase print:hidden">
                BACK FACE / पृष्ठ भाग
              </span>
              <div className="w-[320px] sm:w-[360px] print:w-[85.6mm] print:h-[54mm]">
                <CardBack card={card} className="w-full" />
              </div>
            </div>
          </div>

          {/* Bottom Indicator */}
          <div className="mt-2 flex w-full items-center justify-between text-[9px] font-mono text-slate-500">
            <span>✂ CUT & LAMINATE IN STANDARD PVC POUCH</span>
            <span>SCALE: 100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * 4. INTERACTIVE 3D FLIP CARD
 * ========================================================================= */
export function InteractiveFlipCard({ card }: { card: HealthCard }) {
  const [isFlipped, setIsFlipped] = React.useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 3D Flip Card Container */}
      <div
        className="group relative aspect-[85.6/54] w-full max-w-[460px] min-h-[270px] cursor-pointer [perspective:1200px]"
        onClick={() => setIsFlipped(!isFlipped)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsFlipped(!isFlipped);
          }
        }}
        aria-label={`Digital Health Card for ${card.fullName}. Click to flip between front and back.`}
      >
        <div
          className={`relative size-full transition-transform duration-500 [transform-style:preserve-3d] ${
            isFlipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Front Side */}
          <div className="absolute inset-0 size-full [backface-visibility:hidden]">
            <CardFront card={card} className="size-full" />
          </div>

          {/* Back Side */}
          <div className="absolute inset-0 size-full [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardBack card={card} className="size-full" />
          </div>
        </div>
      </div>

      {/* Quick Flip Toggle Button */}
      <button
        type="button"
        onClick={() => setIsFlipped(!isFlipped)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 print:hidden"
      >
        <RotateCw className="size-3.5 text-primary" />
        <span>Click to flip to {isFlipped ? "Front side" : "Back side (Emergency QR)"}</span>
      </button>
    </div>
  );
}

/* =========================================================================
 * 5. MAIN CARD FACE
 * ========================================================================= */
export function CardFace({ card }: { card: HealthCard }) {
  return <InteractiveFlipCard card={card} />;
}
