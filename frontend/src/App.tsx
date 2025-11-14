import React, { useState, useEffect } from 'react';
import { FileUploader } from './components/FileUploader';
import { authService } from './services/auth';
import { apiService, JobStatus } from './services/api';
import { config } from './config';
import { LogOut, User, FileText, Clock, CheckCircle, Loader, AlertCircle } from 'lucide-react';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if returning from Cognito login
    if (window.location.hash) {
      const success = authService.handleCallback();
      if (success) {
        setIsAuthenticated(true);
        setUser(authService.getUser());
      }
    } else if (authService.isAuthenticated()) {
      setIsAuthenticated(true);
      setUser(authService.getUser());
    }
  }, []);

  // Poll job status when we have a current job that's not completed
  useEffect(() => {
    if (currentJob && !['COMPLETED', 'FAILED', 'TRANSCRIPTION_FAILED'].includes(currentJob.status)) {
      // Start polling
      const interval = setInterval(async () => {
        try {
          const updatedJob = await apiService.getJobStatus(currentJob.job_id);
          setCurrentJob(updatedJob);

          // Stop polling if job is completed or failed
          if (['COMPLETED', 'FAILED', 'TRANSCRIPTION_FAILED'].includes(updatedJob.status)) {
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, config.upload.pollingIntervalMs);

      setPollingInterval(interval);

      // Cleanup on unmount
      return () => {
        clearInterval(interval);
      };
    }
  }, [currentJob?.job_id, currentJob?.status]);

  const handleLogin = () => {
    authService.login();
  };

  const handleLogout = () => {
    // Clear polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    authService.logout();
  };

  const handleUploadComplete = async (jobId: string, fileName: string) => {
    // Create initial job status
    const initialJob: JobStatus = {
      job_id: jobId,
      status: 'TRANSCRIBING',
      file_name: fileName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setCurrentJob(initialJob);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { text: string; icon: React.ReactNode; color: string }> = {
      'TRANSCRIBING': {
        text: 'Transcription en cours...',
        icon: <Loader className="spinner" size={20} />,
        color: '#3b82f6'
      },
      'TRANSCRIBED': {
        text: 'Transcription terminée',
        icon: <CheckCircle size={20} />,
        color: '#10b981'
      },
      'GENERATING': {
        text: 'Génération de l\'article...',
        icon: <Loader className="spinner" size={20} />,
        color: '#3b82f6'
      },
      'COMPLETED': {
        text: 'Article généré avec succès',
        icon: <CheckCircle size={20} />,
        color: '#10b981'
      },
      'FAILED': {
        text: 'Erreur lors de la génération',
        icon: <AlertCircle size={20} />,
        color: '#ef4444'
      },
      'TRANSCRIPTION_FAILED': {
        text: 'Erreur lors de la transcription',
        icon: <AlertCircle size={20} />,
        color: '#ef4444'
      }
    };

    return statusMap[status] || {
      text: status,
      icon: <Clock size={20} />,
      color: '#64748b'
    };
  };

  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="login-container">
          <div className="login-card">
            <div className="logo">
              <h1 className="logo-text">THOR WEB</h1>
            </div>
            <p className="version">Version {config.app.version}</p>
            <p className="description">
              {config.app.description}
            </p>
            <div className="features">
              <div className="feature">
                <CheckCircle size={20} />
                <span>Upload MP3 jusqu'à 500MB</span>
              </div>
              <div className="feature">
                <CheckCircle size={20} />
                <span>Transcription automatique</span>
              </div>
              <div className="feature">
                <CheckCircle size={20} />
                <span>Génération d'article par IA</span>
              </div>
            </div>
            <button onClick={handleLogin} className="login-button">
              Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-logo">THOR WEB</h1>
          </div>
          <div className="header-right">
            <div className="user-info">
              <User size={20} />
              <span>{user?.email || user?.username || 'Utilisateur'}</span>
            </div>
            <button onClick={handleLogout} className="logout-button">
              <LogOut size={20} />
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          <section className="upload-section">
            <h2>Nouveau fichier MP3</h2>
            <FileUploader onUploadComplete={handleUploadComplete} />
          </section>

          {/* Current Job Status */}
          {currentJob && (
            <section className="job-section">
              <h2>Statut du traitement</h2>
              <div className="job-card">
                <div className="job-header">
                  <FileText size={20} />
                  <span className="job-filename">{currentJob.file_name}</span>
                </div>

                <div className="job-status">
                  <div
                    className="status-indicator"
                    style={{ color: getStatusDisplay(currentJob.status).color }}
                  >
                    {getStatusDisplay(currentJob.status).icon}
                    <span>{getStatusDisplay(currentJob.status).text}</span>
                  </div>
                  <div className="job-time">
                    <Clock size={14} />
                    <span>{formatDate(currentJob.created_at)}</span>
                  </div>
                </div>

                {currentJob.error_message && (
                  <div className="job-error">
                    <AlertCircle size={16} />
                    <span>{currentJob.error_message}</span>
                  </div>
                )}

                {/* Display article when completed */}
                {currentJob.status === 'COMPLETED' && currentJob.result && (
                  <div className="article-result">
                    <div className="article-section">
                      <h3 className="article-title">{currentJob.result.titre}</h3>
                    </div>

                    {currentJob.result.introduction && (
                      <div className="article-section">
                        <h4>Introduction</h4>
                        <p className="article-text">{currentJob.result.introduction}</p>
                      </div>
                    )}

                    {currentJob.result.article && (
                      <div className="article-section">
                        <h4>Article</h4>
                        <div className="article-text">
                          {currentJob.result.article.split('\n').map((paragraph, idx) => (
                            paragraph.trim() && <p key={idx}>{paragraph}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentJob.result.conclusion && (
                      <div className="article-section">
                        <h4>Conclusion</h4>
                        <p className="article-text">{currentJob.result.conclusion}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
