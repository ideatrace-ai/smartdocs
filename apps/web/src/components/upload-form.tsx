"use client";

import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Upload,
  FileAudio,
  X,
  CheckCircle2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditorModal } from "./editor-modal";
import { marked } from "marked";
import { envs } from "@/envs";

const MAX_FILE_SIZE_MB = 250;

export function UploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingDetails, setProcessingDetails] = useState<string | null>(
    null,
  );
  const [audioHash, setAudioHash] = useState<string | null>(null);
  const [initialHtmlContent, setInitialHtmlContent] = useState<string | null>(
    null,
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMarkdownContent = useCallback(async (hash: string) => {
    try {
      const response = await fetch(
        `${envs.NEXT_PUBLIC_API_URL}/gateway/download/${hash}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const mdContent = await response.text();
      const htmlContent = await marked(mdContent);
      setInitialHtmlContent(htmlContent);
    } catch (error) {
      console.error("Error fetching markdown content:", error);
      toast.error("Failed to load document content.", {
        description: "Please try downloading it directly.",
      });
    }
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        validateAndSetFile(file);
      }
    },
    [],
  );

  const validateAndSetFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error("File too large", {
        description: `Please upload a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
      });
      return;
    }
    setSelectedFile(file);
    setOriginalFilename(file.name);
    setProcessingStatus(null);
    setProcessingDetails(null);
    setAudioHash(null);
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
    },
    [],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setOriginalFilename(null);
    setProcessingStatus(null);
    setProcessingDetails(null);
    setAudioHash(null);
    setInitialHtmlContent(null);
    setIsEditorOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleOriginalDownload = useCallback(async () => {
    if (audioHash && originalFilename) {
      const response = await fetch(
        `${envs.NEXT_PUBLIC_API_URL}/gateway/download/${audioHash}`,
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const basename =
        originalFilename.split(".").slice(0, -1).join(".") || audioHash;
      a.download = `${basename}.md`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [audioHash, originalFilename]);

  const pollStatus = useCallback(async (hash: string) => {
    const intervalId = setInterval(async () => {
      try {
        const { data, error } = await api.gateway
          .status({ audio_hash: hash })
          .get();

        if (error) {
          console.error("Error polling status:", error);
          return;
        }

        if (data) {
          setProcessingStatus(data.status);
          setProcessingDetails(data.details || null);
          const statusData = data as typeof data & { file_path?: string };

          if (data.status === "COMPLETE" || data.status === "FAILED") {
            clearInterval(intervalId);
            if (data.status === "COMPLETE") {
              toast.success("Processing complete!", {
                description: "Your document is ready.",
              });
              if (hash) {
                fetchMarkdownContent(hash);
              }
            } else {
              toast.error("Processing failed", {
                description: data.details || "An unknown error occurred.",
              });
            }
          }
        }
      } catch (err) {
        console.error("Polling exception:", err);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      toast.warning("No file selected", {
        description: "Please select an audio file to upload.",
      });
      return;
    }

    setIsUploading(true);
    setProcessingStatus("UPLOADING");

    const { data, error } = await api.gateway.upload.post({
      audio: selectedFile,
    });

    if (error) {
      const errorMessage =
        typeof error.value === "string"
          ? error.value
          : "An unexpected error occurred.";
      toast.error("Upload failed", {
        description: errorMessage,
      });
      setIsUploading(false);
      setProcessingStatus("FAILED");
      setProcessingDetails(errorMessage);
      return;
    }

    setIsUploading(false);

    if (data && typeof data === "object" && "audio_hash" in data) {
      const hash = (data as any).audio_hash;
      setAudioHash(hash);

      if ("status" in data && data.status === "accepted") {
        setProcessingStatus("PENDING_VALIDATION");
        pollStatus(hash);
      } else {
        setProcessingStatus("COMPLETE");
        const responseData = data as {
          file_path?: string;
          audio_hash?: string;
        };
        if (responseData.audio_hash) {
          fetchMarkdownContent(responseData.audio_hash);
        }
        toast.success("Analysis complete!", {
          description: "Returning cached result.",
        });
      }
    }
  }, [selectedFile, pollStatus, fetchMarkdownContent]);

  const STATUS_MESSAGES: Record<string, string> = {
    UPLOADING: "Uploading audio file...",
    PENDING_VALIDATION: "Queued for validation...",
    VALIDATING: "Validating audio (Gatekeeper)...",
    PENDING_TRANSCRIPTION: "Queued for transcription...",
    TRANSCRIBING: "Transcribing audio...",
    PENDING_ANALYSIS: "Queued for analysis...",
    ANALYZING: "Analyzing content...",
    COMPLETE: "Processing complete!",
    FAILED: "Processing failed.",
  };

  const getStatusMessage = (status: string | null) => {
    if (!status) return "Ready to upload";
    return STATUS_MESSAGES[status] || "Ready to upload";
  };

  return (
    <Card className="w-full max-w-lg mx-auto border-none shadow-2xl bg-card/50 backdrop-blur-xl ring-1 ring-white/10">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold text-center">
          Upload Meeting Audio
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground/80">
          Drag and drop your recording to generate requirements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ease-in-out group overflow-hidden",
            isDragActive
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30",
            selectedFile ? "border-primary/50 bg-primary/5" : "",
          )}
        >
          <Input
            id="audio-upload"
            type="file"
            accept="audio/*,video/mp4,video/quicktime,video/x-m4a"
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            disabled={
              isUploading ||
              (processingStatus !== null &&
                processingStatus !== "FAILED" &&
                processingStatus !== "COMPLETE")
            }
          />
          <Label
            htmlFor="audio-upload"
            className="flex flex-col items-center justify-center w-full h-full cursor-pointer z-10"
          >
            {selectedFile ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                  <FileAudio className="w-8 h-8" />
                </div>
                <p className="text-lg font-medium text-foreground max-w-[250px] truncate text-center">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                {!processingStatus && (
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveFile();
                    }}
                    className="mt-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isUploading}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove File
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6">
                <div
                  className={cn(
                    "w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110",
                    isDragActive
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <Upload className="w-8 h-8" />
                </div>
                <div className="mb-2 text-lg font-medium text-foreground">
                  <span className="text-primary">Click to upload</span> or drag and drop
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                  MP3, M4A, WAV, MP4 (Max {MAX_FILE_SIZE_MB}MB)
                </p>
              </div>
            )}
          </Label>
        </div>

        {processingStatus && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 p-4 rounded-lg bg-muted/30 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {processingStatus === "COMPLETE" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : processingStatus === "FAILED" ? (
                  <X className="w-5 h-5 text-red-500" />
                ) : null}
                {getStatusMessage(processingStatus)}
              </div>
              {processingStatus !== "COMPLETE" &&
                processingStatus !== "FAILED" && (
                  <div className="flex items-center gap-2">
                    <Spinner size="size-4" />
                    <Text variant="shine" className="text-sm text-muted-foreground">Processing...</Text>
                  </div>
                )}
            </div>

            {processingDetails && (
              <p className="text-sm text-muted-foreground bg-black/20 p-2 rounded border border-white/5 font-mono">
                {processingDetails}
              </p>
            )}

            {processingStatus === "COMPLETE" && (
              <div className="grid grid-cols-2 gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={handleOriginalDownload}
                  disabled={!audioHash || !originalFilename}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Original
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setIsEditorOpen(true)}
                  disabled={!initialHtmlContent}
                >
                  Open Editor
                </Button>
              </div>
            )}

            {(processingStatus === "COMPLETE" ||
              processingStatus === "FAILED") && (
                <Button
                  variant="outline"
                  className="w-full mt-2 bg-white text-black hover:bg-gray-100"
                  onClick={handleRemoveFile}
                >
                  Upload Another File
                </Button>
              )}
          </div>
        )}

        <EditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          initialHtmlContent={initialHtmlContent || ""}
          audioHash={audioHash}
          originalFilename={originalFilename}
        />
        {!processingStatus && (
          <Button
            onClick={handleUpload}
            variant="outline"
            className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 hover:-translate-y-0.5 bg-white text-black hover:bg-gray-100"
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <Spinner size="size-5" className="mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Start Analysis
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
