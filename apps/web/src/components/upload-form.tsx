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
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

const MAX_FILE_SIZE_MB = 250;

export function UploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast.error("File too large", {
            description: `Please upload a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
          });
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
        setSelectedFile(file);
        setUploadProgress(0);
      }
    },
    [],
  );

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error("File too large", {
          description: `Please upload a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
        });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedFile(file);
      setUploadProgress(0);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      toast.warning("No file selected", {
        description: "Please select an audio file to upload.",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(50);

    const { data, error } = await api.gatewayRouter.upload.post({
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
      setUploadProgress(0);
      setIsUploading(false);
      return;
    }

    setUploadProgress(100);

    if (
      data &&
      typeof data === "object" &&
      "status" in data &&
      data.status === "accepted"
    ) {
      toast.success("Upload accepted!", {
        description: (
          <div>
            <p>
              Audio Hash: <strong>{data.audio_hash}</strong>
            </p>
            <p>Processing has started.</p>
          </div>
        ),
        duration: 8000,
      });
    } else {
      toast.success("Cache hit!", {
        description:
          "This audio has been processed before. Returning cached document.",
        duration: 8000,
      });
      // You could optionally display the cached 'data' here.
    }

    handleRemoveFile();
    setIsUploading(false);
  }, [selectedFile, handleRemoveFile]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          Upload Your Meeting Audio
        </CardTitle>
        <CardDescription className="text-center">
          Drag and drop your audio file here, or click to select.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/70 transition-colors"
        >
          <Input
            id="audio-upload"
            type="file"
            accept="audio/*,video/mp4,video/quicktime,video/x-m4a"
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            disabled={isUploading}
          />
          <Label
            htmlFor="audio-upload"
            className="flex flex-col items-center justify-center w-full h-full cursor-pointer"
          >
            {selectedFile ? (
              <div className="text-center">
                <p className="text-lg font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemoveFile();
                  }}
                  className="mt-2"
                  disabled={isUploading}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <svg
                  className="w-10 h-10 mb-3 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  ></path>
                </svg>
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  MP3, M4A, WAV (Video files also accepted, but audio preferred
                  for best results. MAX. {MAX_FILE_SIZE_MB}MB)
                </p>
              </div>
            )}
          </Label>
        </div>

        {isUploading && (
          <div className="mt-4">
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-center text-sm text-muted-foreground mt-2">
              Uploading...
            </p>
          </div>
        )}

        <Button
          onClick={handleUpload}
          className="w-full mt-6"
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? "Uploading..." : "Start Analysis"}
        </Button>
      </CardContent>
    </Card>
  );
}
