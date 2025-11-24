import { UploadForm } from "@/components/upload-form";
import { IdeaTraceLogo } from "@/components/logo/ideatrace";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[400px] bg-secondary/10 rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-5xl flex flex-col items-center gap-12 z-10">
        <div className="flex flex-col items-center gap-6 animate-fade-in-down">
          <div className="flex items-center justify-center gap-4">
            <IdeaTraceLogo className="w-16 h-auto" />
            <h1 className="text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-gray-400">
              Ideatrace
            </h1>
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
