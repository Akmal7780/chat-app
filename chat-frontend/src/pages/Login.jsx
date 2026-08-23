import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useGoogleLogin } from "@react-oauth/google";
import "./Auth.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Two-Step Verification (a second password on top of the normal one)
  const [twoFAStep, setTwoFAStep] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [twoFAHint, setTwoFAHint] = useState("");
  const [twoFAPassword, setTwoFAPassword] = useState("");

  const completeLogin = (data, fallbackEmail) => {
    if (!data.access) {
      alert("Login failed: No access token");
      return;
    }

    localStorage.setItem("token", data.access);
    localStorage.setItem("refresh_token", data.refresh || "");

    let userData = null;

    if (data.user) {
      userData = data.user;
    } else {
      try {
        const tokenParts = data.access.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));

          userData = {
            id: payload.user_id || payload.id || 1,
            username: payload.username || fallbackEmail?.split('@')[0],
            email: payload.email || fallbackEmail
          };
        }
      } catch (e) {
        console.log("Token decode error:", e);
      }
    }

    if (!userData) {
      userData = {
        id: 1,
        username: fallbackEmail?.split('@')[0],
        email: fallbackEmail
      };
    }

    localStorage.setItem("user", JSON.stringify(userData));
    navigate("/chat");
  };

  // 🔐 NORMAL LOGIN
  const handleLogin = async () => {
    if (!email || !password) {
      alert("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/users/login/", {
        email,
        password
      });

      if (res.data.requires_2fa) {
        setTempToken(res.data.temp_token);
        setTwoFAHint(res.data.hint || "");
        setTwoFAStep(true);
        return;
      }

      completeLogin(res.data, email);

    } catch (err) {
      console.log("❌ Login error:", err);
      alert(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // 🔒 TWO-STEP VERIFICATION
  const handleVerify2FA = async () => {
    if (!twoFAPassword) {
      alert("Please enter your password");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/users/login/verify-2fa/", {
        temp_token: tempToken,
        password: twoFAPassword,
      });

      completeLogin(res.data, email);

    } catch (err) {
      console.log("❌ 2FA verify error:", err);
      alert(err.response?.data?.error || "Incorrect password");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 GOOGLE LOGIN (ACCESS TOKEN)
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);

        console.log("🔥 Google token:", tokenResponse);

        const res = await api.post("/users/google/", {
          access_token: tokenResponse.access_token   
        });

        console.log("✅ Google login response:", res.data);

        if (res.data.access) {
          localStorage.setItem("token", res.data.access);
          localStorage.setItem("refresh_token", res.data.refresh || "");

          const userData = res.data.user || {
            id: res.data.user_id || Date.now(),
            username: "google_user",
            email: "google@gmail.com"
          };

          localStorage.setItem("user", JSON.stringify(userData));

          navigate("/chat");
        }

      } catch (err) {
        console.log("❌ Google login error:", err);
        alert("Google login failed");
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      console.log("❌ Google login failed");
    },
  });

  if (twoFAStep) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-2fa-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 17V15M8 11V8C8 5.79086 9.79086 4 12 4C14.2091 4 16 5.79086 16 8V11M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="auth-title">Two-Step Verification</h2>
            <p className="auth-subtitle">Enter the additional password you set for your account.</p>
          </div>

          <div className="auth-form">
            <div className="input-group">
              <label className="input-label">Password</label>
              <div className="input-wrapper">
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Enter your password"
                  value={twoFAPassword}
                  onChange={(e) => setTwoFAPassword(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleVerify2FA()}
                />
              </div>
              {twoFAHint && <small className="auth-2fa-hint">Hint: {twoFAHint}</small>}
            </div>

            <button
              className="auth-button"
              onClick={handleVerify2FA}
              disabled={loading}
            >
              {loading ? "Loading..." : "Continue"}
            </button>

            <button
              className="auth-button auth-button-secondary"
              onClick={() => {
                setTwoFAStep(false)
                setTwoFAPassword("")
                setTempToken(null)
              }}
              disabled={loading}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M10,2 H18 A3,3 0 0 1 21,5 V9 A3,3 0 0 1 18,12 H13 L11,15 L10,12 A3,3 0 0 1 7,9 V5 A3,3 0 0 1 10,2 Z"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M6,9 H14 A3,3 0 0 1 17,12 V16 A3,3 0 0 1 14,19 H9 L7,22 L6,19 A3,3 0 0 1 3,16 V12 A3,3 0 0 1 6,9 Z"
              fill="#4F46E5"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="auth-header">
          <h2 className="auth-title">Welcome Back</h2>
          <p className="auth-subtitle">Sign in to continue to Nexus Chat</p>
        </div>

        <div className="auth-form">

          {/* EMAIL */}
          <div className="input-group">
  <label className="input-label">Email</label>

  <div className="input-wrapper">
    {/* 🔥 ICON */}
    <svg
      className="input-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 7L10.94 11.337C11.5885 11.7428 12.4115 11.7428 13.06 11.337L20 7M4 17H20C21.1046 17 22 16.1046 22 15V9C22 7.89543 21.1046 7 20 7H4C2.89543 7 2 7.89543 2 9V15C2 16.1046 2.89543 17 4 17Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>

    {/* 🔥 INPUT */}
    <input
      type="email"
      className="auth-input"
      placeholder="Enter your email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
  </div>
</div>

          {/* PASSWORD */}
          <div className="input-group">
  <label className="input-label">Password</label>

  <div className="input-wrapper">
    {/* 🔒 ICON */}
    <svg
      className="input-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 17V15M8 11V8C8 5.79086 9.79086 4 12 4C14.2091 4 16 5.79086 16 8V11M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>

    {/* INPUT */}
    <input
      type={showPassword ? "text" : "password"}
      className="auth-input"
      placeholder="Enter your password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />

    {/* TOGGLE */}
    <button
      type="button"
      className="password-toggle"
      onClick={() => setShowPassword(!showPassword)}
    >
      {showPassword ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s1.4 2.9 4.1 4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
    </button>
  </div>
</div>

          {/* LOGIN BUTTON */}
          <button 
            className="auth-button" 
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Loading..." : "Sign In"}
          </button>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>

          {/* GOOGLE BUTTON */}
          <button
            className="auth-button"
            onClick={() => googleLogin()}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.6 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.6 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.6 26.7 35.5 24 35.5c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 43 24 43z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.4 4.4-4.5 5.9l6.2 5.2C40.9 36.4 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>

        </div>

        <div className="auth-footer">
          <p>
            Don't have an account?{" "}
            <Link to="/register">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;