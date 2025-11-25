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
  private uploadBaseUrl: string;

  constructor() {
    this.baseUrl = config.api.endpoint; // For subscription/billing
    this.uploadBaseUrl = config.api.uploadEndpoint; // For upload/jobs
  }

  /**
   * Upload MP3 file using presigned URL (3-step process)
   */
  async uploadFile(file: File): Promise<UploadResponse> {
    // Step 1: Get presigned URL
    const initResponse = await fetch(`${this.uploadBaseUrl}/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken()}`
      },
      body: JSON.stringify({
        filename: file.name,
        fileSize: file.size
      })
    });

    if (!initResponse.ok) {
      const error = await initResponse.json();
      throw new Error(error.error || 'Failed to initialize upload');
    }

    const initData = await initResponse.json();
    const { upload_url, job_id } = initData;

    // Step 2: Upload directly to S3 using presigned URL
    const uploadResponse = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/mpeg'
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.status}`);
    }

    // Step 3: Start transcription
    const startResponse = await fetch(`${this.uploadBaseUrl}/upload/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken()}`
      },
      body: JSON.stringify({
        job_id: job_id
      })
    });

    if (!startResponse.ok) {
      const error = await startResponse.json();
      throw new Error(error.error || 'Failed to start transcription');
    }

    return startResponse.json();
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${this.uploadBaseUrl}/jobs/${jobId}`, {
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
    const response = await fetch(`${this.uploadBaseUrl}/jobs?limit=${limit}`, {
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
}

export const apiService = new ApiService();
