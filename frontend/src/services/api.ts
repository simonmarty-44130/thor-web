import { config } from '../config';
import { authService } from './auth';

/**
 * API Service
 * Handles communication with backend Lambda functions
 */

export interface UploadResponse {
  message: string;
  job_id: string;
  status: string;
  file_name: string;
  file_size_mb: string;
}

export interface JobStatus {
  job_id: string;
  status: string;
  file_name: string;
  created_at: string;
  updated_at: string;
  result?: {
    titre: string;
    introduction: string;
    article: string;
    conclusion: string;
  };
  error_message?: string;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.api.endpoint;
  }

  /**
   * Upload MP3 file
   */
  async uploadFile(file: File): Promise<UploadResponse> {
    // Convert file to base64
    const base64 = await this.fileToBase64(file);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken()}`
      },
      body: JSON.stringify({
        file: base64,
        filename: file.name
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get job status');
    }

    return response.json();
  }

  /**
   * Get user's recent jobs
   */
  async getUserJobs(limit: number = 10): Promise<JobStatus[]> {
    const response = await fetch(`${this.baseUrl}/jobs?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get jobs');
    }

    const data = await response.json();
    return data.jobs || [];
  }

  /**
   * Convert file to base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:audio/mpeg;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }
}

export const apiService = new ApiService();
