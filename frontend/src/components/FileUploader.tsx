import React, { useState, useRef } from 'react';
import { Upload, FileAudio, AlertCircle, Loader } from 'lucide-react';
import { apiService } from '../services/api';
import { config } from '../config';
import './FileUploader.css';

interface FileUploaderProps {
  onUploadComplete: (jobId: string, fileName: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    setError(null);

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      setError('Seuls les fichiers MP3 sont acceptés');
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > config.upload.maxFileSizeMB) {
      setError(`Le fichier est trop volumineux (max ${config.upload.maxFileSizeMB}MB)`);
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const response = await apiService.uploadFile(selectedFile);

      console.log('Upload response:', response);

      // Call parent callback
      onUploadComplete(response.job_id, selectedFile.name);

      // Reset state
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="file-uploader">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !selectedFile && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          disabled={uploading}
        />

        {!selectedFile ? (
          <div className="drop-zone-content">
            <Upload size={48} />
            <p className="drop-zone-title">
              Glissez-déposez votre fichier MP3 ici
            </p>
            <p className="drop-zone-subtitle">
              ou cliquez pour sélectionner
            </p>
            <p className="drop-zone-info">
              Taille max: {config.upload.maxFileSizeMB}MB
            </p>
          </div>
        ) : (
          <div className="selected-file">
            <FileAudio size={48} />
            <div className="file-info">
              <p className="file-name">{selectedFile.name}</p>
              <p className="file-size">{formatFileSize(selectedFile.size)}</p>
            </div>
            {!uploading && (
              <button
                className="remove-file-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile();
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {selectedFile && (
        <button
          className="upload-button"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader className="spinner" size={20} />
              Upload en cours...
            </>
          ) : (
            <>
              <Upload size={20} />
              Générer l'article
            </>
          )}
        </button>
      )}
    </div>
  );
};
