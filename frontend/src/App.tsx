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
  const [jobHistory, setJobHistory] = useState<JobStatus[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);

  // Check if user has access to this tool based on Cognito groups
  const checkUserAccess = (userInfo: any): boolean => {
    if (!userInfo) return false;

    const userGroups = userInfo['cognito:groups'] || [];

    // all-access group has access to everything
    if (userGroups.includes('all-access')) {
      return true;
    }

    // web-only group has access to web tool
    if (userGroups.includes('web-only')) {
      return true;
    }

    // If user has no groups, grant access by default (backwards compatibility)
    if (userGroups.length === 0) {
      return true;
    }

    return false;
  };

  // Load job history when authenticated
  const loadJobHistory = async () => {
    setLoadingHistory(true);
    try {
      const jobs = await apiService.getUserJobs(10);
      // Filter to show only completed jobs
      const completedJobs = jobs.filter(job => job.status === 'COMPLETED');
      setJobHistory(completedJobs);
    } catch (error) {
      console.error('Error loading job history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    // Check if returning from Cognito login
    if (window.location.hash) {
      const success = authService.handleCallback();
      if (success) {
        const userInfo = authService.getUser();
        setIsAuthenticated(true);
        setUser(userInfo);
        setHasAccess(checkUserAccess(userInfo));
      }
    } else if (authService.isAuthenticated()) {
      const userInfo = authService.getUser();
      setIsAuthenticated(true);
      setUser(userInfo);
      setHasAccess(checkUserAccess(userInfo));
    }
  }, []);

  // Load history when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadJobHistory();
    }
  }, [isAuthenticated]);

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

  const handleLogin = (pool: 'demo' | 'saint-esprit' = 'demo') => {
    authService.login(pool);
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
    // Refresh history
    loadJobHistory();
  };

  const handleSelectJob = async (jobId: string) => {
    try {
      const job = await apiService.getJobStatus(jobId);
      setCurrentJob(job);
    } catch (error) {
      console.error('Error loading job:', error);
    }
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
              <img src="/thor-logo.png" alt="THOR Podcast" />
            </div>
            <h1 style={{color: '#1e293b', fontSize: '24px', marginBottom: '8px'}}>Article Web</h1>
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
            <button onClick={() => handleLogin('demo')} className="login-button">
              Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show access denied if user doesn't have permission
  if (!hasAccess) {
    return (
      <div className="app">
        <div className="login-container">
          <div className="login-card">
            <div className="logo">
              <img src="/thor-logo.png" alt="THOR Podcast" />
            </div>
            <h1 style={{color: '#dc2626', fontSize: '24px', marginBottom: '16px'}}>Accès non autorisé</h1>
            <p className="description" style={{color: '#64748b', marginBottom: '24px'}}>
              Votre compte n'a pas les permissions nécessaires pour accéder à cet outil.
            </p>
            <p style={{color: '#94a3b8', fontSize: '14px', marginBottom: '24px'}}>
              Connecté en tant que : <strong>{user?.email || user?.username}</strong>
            </p>
            <button onClick={handleLogout} className="login-button" style={{background: '#dc2626'}}>
              Se déconnecter
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
            <a href="https://thorpodcast.link/login.html" style={{textDecoration: 'none', display: 'flex', alignItems: 'center'}}>
              <img src="/thor-logo.png" alt="Thor Podcast" style={{height: '40px', width: 'auto'}} />
            </a>
            <nav className="header-nav">
              <a href="https://thorpodcast.link/login.html" className="nav-link">
                <User size={16} />
                Accueil
              </a>
              <a href="https://titre.thorpodcast.link" className="nav-link">
                <FileText size={16} />
                Titre & Résumé
              </a>
              <a href="https://web.thorpodcast.link" className="nav-link active">
                <FileText size={16} />
                Article Web
              </a>
            </nav>
          </div>
          <div className="header-right">
            <div className="user-info">
              <User size={20} />
              <span>{user?.email || user?.username || 'Utilisateur'}</span>
              {(user?.['custom:group'] || user?.['cognito:groups']?.[0]) && (
                <span className="user-group">
                  {user?.['custom:group'] || user?.['cognito:groups']?.[0]}
                </span>
              )}
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

          {/* Job History */}
          {jobHistory.length > 0 && (
            <section className="history-section">
              <h2>Historique des traitements</h2>
              <div className="history-list">
                {loadingHistory ? (
                  <div className="loading-history">
                    <Loader className="spinner" size={20} />
                    <span>Chargement...</span>
                  </div>
                ) : (
                  jobHistory.map((job) => (
                    <div
                      key={job.job_id}
                      className={`history-item ${currentJob?.job_id === job.job_id ? 'selected' : ''}`}
                      onClick={() => handleSelectJob(job.job_id)}
                    >
                      <div className="history-item-header">
                        <FileText size={16} />
                        <span className="history-filename">{job.file_name}</span>
                      </div>
                      <div className="history-item-meta">
                        <div
                          className="history-status"
                          style={{ color: getStatusDisplay(job.status).color }}
                        >
                          {getStatusDisplay(job.status).icon}
                        </div>
                        <span className="history-date">{formatDate(job.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

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
                    {currentJob.result.titre && (
                      <h3 className="article-title">{currentJob.result.titre}</h3>
                    )}
                    <div className="article-content">
                      {currentJob.result.article.split('\n').map((line, idx) => {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) return null;

                        // Handle markdown headers
                        if (trimmedLine.startsWith('### ')) {
                          return <h4 key={idx} className="article-h4">{trimmedLine.substring(4)}</h4>;
                        }
                        if (trimmedLine.startsWith('## ')) {
                          return <h3 key={idx} className="article-h3">{trimmedLine.substring(3)}</h3>;
                        }
                        if (trimmedLine.startsWith('# ')) {
                          return null; // Skip main title as we display it above
                        }

                        return <p key={idx} className="article-paragraph">{trimmedLine}</p>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>Thor Podcast v{config.app.version} © 2025 Premiere Pierre Media</p>
      </footer>
    </div>
  );
}

export default App;
