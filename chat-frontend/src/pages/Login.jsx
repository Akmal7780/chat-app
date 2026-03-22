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

      if (res.data.access) {
        localStorage.setItem("token", res.data.access);
        localStorage.setItem("refresh_token", res.data.refresh || "");
        
        let userData = null;
        
        if (res.data.user) {
          userData = res.data.user;
        } else {
          try {
            const tokenParts = res.data.access.split('.');
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]));
              
              userData = {
                id: payload.user_id || payload.id || 1,
                username: payload.username || email.split('@')[0],
                email: payload.email || email
              };
            }
          } catch (e) {
            console.log("Token decode error:", e);
          }
        }
        
        if (!userData) {
          userData = {
            id: 1,
            username: email.split('@')[0],
            email: email
          };
        }
        
        localStorage.setItem("user", JSON.stringify(userData));
        navigate("/chat");
      } else {
        alert("Login failed: No access token");
      }

    } catch (err) {
      console.log("❌ Login error:", err);
      alert(err.response?.data?.detail || "Login failed");
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

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h2 className="auth-title">Welcome Back</h2>
          <p className="auth-subtitle">Sign in to continue to Chat App</p>
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

    {/* 👁️ TOGGLE */}
    <button
      type="button"
      className="password-toggle"
      onClick={() => setShowPassword(!showPassword)}
    >
      {showPassword ? "👁️" : "👁️‍🗨️"}
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

          {/* 🔥 GOOGLE BUTTON */}
          <button 
            className="auth-button"
            onClick={() => googleLogin()}
            disabled={loading}
          >
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