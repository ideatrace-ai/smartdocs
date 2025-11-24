"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import MarkdownEditor from "./markdown-editor";
import TurndownService from "turndown";
import { Download } from "lucide-react";

interface EditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHtmlContent: string;
  audioHash: string | null;
  originalFilename: string | null;
}

export const EditorModal = ({
  isOpen,
  onClose,
  initialHtmlContent,
  audioHash,
  originalFilename,
}: EditorModalProps) => {
  const [currentHtmlContent, setCurrentHtmlContent] =
    useState(initialHtmlContent);
  const turndownService = new TurndownService();

  useEffect(() => {
    if (isOpen) {
      setCurrentHtmlContent(initialHtmlContent);
    }
  }, [isOpen, initialHtmlContent]);

  const handleDownload = useCallback(() => {
    if (audioHash) {
      const markdown = turndownService.turndown(currentHtmlContent);
            const blob = new Blob([markdown], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
      
            const basename =
              originalFilename?.split(".").slice(0, -1).join(".") || audioHash;
            a.download = `${basename}.md`;
      
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);    }
  }, [audioHash, currentHtmlContent, turndownService, originalFilename]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Markdown Editor</DialogTitle>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto -mx-6 px-6">
          <MarkdownEditor
            content={currentHtmlContent}
            onContentChange={setCurrentHtmlContent}
          />
        </div>
        <DialogFooter className="pt-4">
          <Button
            onClick={handleDownload}
            variant="default"
            className="bg-white text-black hover:bg-gray-100"
          >
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
