/**
 * PICLOAD Authentication Manager
 * Handles user authentication and session management
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.init();
    }

    /**
     * Initialize auth manager
     */
    async init() {
        try {
            // Check if user is already authenticated
            const storedToken = localStorage.getItem('picload_token');
            const storedUser = localStorage.getItem('picload_user');

            if (storedToken && storedUser) {
                this.token = storedToken;
                this.currentUser = JSON.parse(storedUser);

                // Validate token with backend
                if (await this.validateToken()) {
                    this.currentUser.token = this.token;
                } else {
                    this.logout();
                }
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
            this.logout();
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.currentUser && !!this.token;
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Login user
     */
    async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            this.setUserSession(data.user, data.token);
            return { success: true, user: data.user };

        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Register user
     */
    async register(name, email, password) {
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });

            if (!response.ok) {
                throw new Error('Registration failed');
            }

            const data = await response.json();
            this.setUserSession(data.user, data.token);
            return { success: true, user: data.user };

        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            if (this.token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearUserSession();
        }
    }

    /**
     * Validate token with backend
     */
    async validateToken() {
        try {
            const response = await fetch('/api/auth/validate', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    /**
     * Set user session
     */
    setUserSession(user, token) {
        this.currentUser = user;
        this.token = token;
        this.currentUser.token = token;
        localStorage.setItem('picload_token', token);
        localStorage.setItem('picload_user', JSON.stringify(user));
    }

    /**
     * Clear user session
     */
    clearUserSession() {
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('picload_token');
        localStorage.removeItem('picload_user');
    }
}

// Initialize auth manager
window.authManager = new AuthManager();

// All Right Reserved. This code is provided as-is without warranty of any kind. Use at your own risk.
// Property of Picpool. Issued under the MIT License. See LICENSE file for details.