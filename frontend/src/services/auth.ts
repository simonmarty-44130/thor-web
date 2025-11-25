import { config } from '../config';

/**
 * Authentication Service
 * Inspired by Thor KTO V2
 * Handles Cognito authentication flow
 */
class AuthService {
  private accessToken: string | null = null;
  private idToken: string | null = null;
  private user: any = null;
  private currentPool: 'demo' | 'saint-esprit' = 'demo';

  constructor() {
    // Load token from localStorage on init
    this.loadFromStorage();
  }

  /**
   * Redirect to Cognito login page
   */
  login(pool: 'demo' | 'saint-esprit' = 'demo'): void {
    this.currentPool = pool;
    localStorage.setItem('thor_web_pool', pool);

    const cognitoConfig = pool === 'saint-esprit'
      ? config.saintEspritCognito
      : config.cognito;

    const { clientId, domain, redirectUri, responseType } = cognitoConfig;

    const loginUrl = `https://${domain}.auth.${cognitoConfig.region}.amazoncognito.com/login?` +
      `client_id=${clientId}&` +
      `response_type=${responseType}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}`;

    window.location.href = loginUrl;
  }

  /**
   * Handle callback from Cognito (hash fragment contains token)
   */
  handleCallback(): boolean {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');

    if (accessToken && idToken) {
      this.accessToken = accessToken;
      this.idToken = idToken;

      // Decode JWT to get user info (simple base64 decode, not verification)
      const payload = this.decodeJWT(idToken);
      this.user = payload;

      // Save to localStorage
      this.saveToStorage();

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      return true;
    }

    return false;
  }

  /**
   * Logout user
   */
  logout(): void {
    this.accessToken = null;
    this.idToken = null;
    this.user = null;
    localStorage.removeItem('thor_web_token');
    localStorage.removeItem('thor_web_id_token');
    localStorage.removeItem('thor_web_user');

    // Redirect to home
    window.location.href = '/';
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.idToken !== null;
  }

  /**
   * Get ID token (for API Gateway Cognito authorizer)
   */
  getToken(): string | null {
    return this.idToken;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get user info
   */
  getUser(): any {
    return this.user;
  }

  /**
   * Decode JWT token (simple base64 decode without verification)
   */
  private decodeJWT(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT');
      }

      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }

  /**
   * Save to localStorage
   */
  private saveToStorage(): void {
    if (this.accessToken) {
      localStorage.setItem('thor_web_token', this.accessToken);
    }
    if (this.idToken) {
      localStorage.setItem('thor_web_id_token', this.idToken);
    }
    if (this.user) {
      localStorage.setItem('thor_web_user', JSON.stringify(this.user));
    }
  }

  /**
   * Load from localStorage
   */
  private loadFromStorage(): void {
    const token = localStorage.getItem('thor_web_token');
    const idToken = localStorage.getItem('thor_web_id_token');
    const user = localStorage.getItem('thor_web_user');
    const pool = localStorage.getItem('thor_web_pool') as 'demo' | 'saint-esprit' | null;

    if (token) {
      this.accessToken = token;
    }
    if (idToken) {
      this.idToken = idToken;
    }
    if (user) {
      try {
        this.user = JSON.parse(user);
      } catch (error) {
        console.error('Error parsing user from storage:', error);
      }
    }
    if (pool) {
      this.currentPool = pool;
    }
  }

  /**
   * Get current pool
   */
  getCurrentPool(): 'demo' | 'saint-esprit' {
    return this.currentPool;
  }
}

export const authService = new AuthService();
