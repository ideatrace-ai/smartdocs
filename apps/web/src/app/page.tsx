import { UploadForm } from "@/components/upload-form";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[400px] bg-secondary/10 rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-5xl flex flex-col items-center gap-12 z-10">
        <div className="flex flex-col items-center gap-6 animate-fade-in-down">
          <div className="relative w-[500px] h-32 md:w-[600px] md:h-40 mix-blend-screen">
            <Image
              src="/logo-with-name.png"
              alt="SmartDocs Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <p className="text-muted-foreground text-center max-w-md text-lg">
            Transform your meetings into structured requirements with local AI.
          </p>
        </div>

        <div className="w-full flex justify-center animate-fade-in-up delay-200">
          <UploadForm />
        </div>
      </div>
    </main>
  );
}
