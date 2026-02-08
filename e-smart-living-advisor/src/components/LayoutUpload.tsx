import { useState } from "react";
import { Home, Upload, X } from "lucide-react";

interface LayoutUploadProps {
  onUpload: (file: File) => void;
  disabled?: boolean;
}

const LayoutUpload = ({ onUpload, disabled }: LayoutUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFile = (file: File) => {
    setUploadedFile(file);
    onUpload(file);
    
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setPreview(null);
  };

  if (uploadedFile) {
    return (
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          {preview ? (
            <img 
              src={preview} 
              alt="Layout preview" 
              className="w-16 h-16 rounded-lg object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
              <Home className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {uploadedFile.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {(uploadedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button 
            onClick={removeFile}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <label
      className={`block mb-4 transition-all duration-300 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${isDragging ? "scale-[1.02]" : ""}`}
      onDragOver={disabled ? undefined : handleDragOver}
      onDragLeave={disabled ? undefined : handleDragLeave}
      onDrop={disabled ? undefined : handleDrop}
    >
      <input
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        onChange={handleInputChange}
        disabled={disabled}
      />
      <div className={`
        border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300
        ${isDragging 
          ? 'border-primary/50 bg-primary/5' 
          : 'border-border hover:border-primary/30 hover:bg-secondary/30'
        }
      `}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Upload your apartment or villa layout
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, image, or screenshot
            </p>
          </div>
        </div>
      </div>
    </label>
  );
};

export default LayoutUpload;
