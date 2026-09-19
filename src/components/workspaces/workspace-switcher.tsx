"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWorkspace } from "./workspace-context";
import { useSession } from "@/lib/auth/session-stub";
import { useTranslation } from "@/lib/i18n/context";
import {
  IconHousePlus,
  IconSparkles,
  IconShield,
  IconUser,
} from "@/components/shell/icons";

interface WorkspaceSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function WorkspaceSwitcher({ compact = false, className = "" }: WorkspaceSwitcherProps) {
  const { user, credits } = useSession();
  const { lang } = useTranslation();
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    setCreateWorkspaceModalOpen,
    setSettingsModalOpen,
  } = useWorkspace();

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const currentRole = activeWorkspace?.role;
  const isOwnerOrEditor = currentRole === "owner" || currentRole === "architect";

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 items-center gap-2 rounded-xl border border-amber-500/20 bg-card/80 px-2.5 py-1 text-left text-xs font-semibold text-foreground shadow-2xs backdrop-blur-md transition-all hover:bg-card hover:border-amber-500/40 active:scale-[0.99]"
      >
        <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-brand-primary dark:text-amber-400">
          {activeWorkspace ? (
            <IconHousePlus className="size-3.5" />
          ) : (
            <IconUser className="size-3.5" />
          )}
        </div>

        {!compact && (
          <div className="flex max-w-[130px] flex-col overflow-hidden text-left">
            <span className="truncate text-xs font-bold leading-tight text-foreground">
              {activeWorkspace ? activeWorkspace.name : (lang === "vi" ? "Cá nhân" : "Personal")}
            </span>
            <span className="text-[10px] font-normal text-foreground/60 leading-tight">
              {activeWorkspace
                ? `${activeWorkspace.availableCredits ?? 0} credits • ${activeWorkspace.role || "member"}`
                : `${credits ?? 0} credits`}
            </span>
          </div>
        )}

        <svg
          className={`size-3 text-foreground/50 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-50 w-64 rounded-2xl border border-amber-500/20 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 border-b border-border/50">
            <p className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider">
              {lang === "vi" ? "Không gian làm việc" : "Workspaces & Studio"}
            </p>
          </div>

          <div className="py-1">
            {/* Personal Account Option */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setActiveWorkspaceId(null);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                activeWorkspace === null
                  ? "bg-amber-500/10 font-bold text-brand-primary dark:text-amber-400"
                  : "text-foreground/80 hover:bg-white/5 font-medium"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-lg bg-foreground/5">
                  <IconUser className="size-3.5" />
                </div>
                <div>
                  <p>{lang === "vi" ? "Tài khoản cá nhân" : "Personal Account"}</p>
                  <p className="text-[10px] text-foreground/50 font-normal">
                    {credits ?? 0} {lang === "vi" ? "credits cá nhân" : "personal credits"}
                  </p>
                </div>
              </div>
              {activeWorkspace === null && (
                <span className="size-1.5 rounded-full bg-brand-primary" />
              )}
            </button>

            {/* Workspaces List */}
            {workspaces.map((ws) => {
              const isSelected = activeWorkspace?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-amber-500/10 font-bold text-brand-primary dark:text-amber-400"
                      : "text-foreground/80 hover:bg-white/5 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-brand-primary dark:text-amber-400 font-bold text-[11px]">
                      {ws.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate">{ws.name}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-foreground/50 font-normal">
                        <span className="flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400">
                          <IconSparkles className="size-2.5" />
                          {ws.availableCredits ?? 0}c
                        </span>
                        <span>•</span>
                        <span className="capitalize">{ws.role}</span>
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="size-1.5 shrink-0 rounded-full bg-brand-primary" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border/50 pt-1">
            {activeWorkspace && isOwnerOrEditor && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setSettingsModalOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <IconShield className="size-3.5 text-amber-500" />
                <span>{lang === "vi" ? "Cài đặt & Quản lý nhóm" : "Studio & Team Settings"}</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreateWorkspaceModalOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-brand-primary hover:bg-brand-primary/10 transition-colors"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{lang === "vi" ? "+ Tạo Studio mới" : "+ Create Team Studio"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
