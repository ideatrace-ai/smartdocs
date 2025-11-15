import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-gray-900 to-black text-white">
      <UploadForm />
    </main>
  );
}
