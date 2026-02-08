import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Home, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import LayoutUpload from "@/components/LayoutUpload";
import Header from "@/components/Header";
import { createLayoutDraft } from "@/lib/api";

const LayoutUploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleContinue = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const draft = await createLayoutDraft(file);
      const imageUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;
      navigate("/layout/editor", { state: { layout: draft, imageUrl } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create draft");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-6">
          <Home className="w-4 h-4" />
          <span>Upload floor plan</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Upload your floor plan
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          PDF, JPG or PNG. We’ll detect rooms and dimensions so you can confirm or edit before recommendations.
        </p>
        <LayoutUpload onUpload={setFile} disabled={loading} />
        {error && (
          <p className="text-destructive text-sm mt-2" role="alert">
            {error}
          </p>
        )}
        <Button
          className="mt-6 w-full sm:w-auto"
          onClick={handleContinue}
          disabled={!file || loading}
        >
          {loading ? "Analyzing…" : "Continue"}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </main>
    </div>
  );
};

export default LayoutUploadPage;
