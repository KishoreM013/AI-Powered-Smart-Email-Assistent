import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useUser, useToast } from '../../App';
import { authService, emailService } from '../../services/api';
import { 
  LayoutDashboard, 
  Inbox, 
  ShieldAlert, 
  BarChart3, 
  Settings, 
  User, 
  ShieldCheck, 
  LogOut, 
  Sun, 
  Moon, 
  Menu, 
  X,
  Mail
} from 'lucide-react';

export default function Sidebar() {
  const { user, theme, toggleTheme } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = async () => {
    try {
      const emails = await emailService.list({ is_read: false });
      setUnreadCount(emails.length);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUnread();
    // Poll unread count every 30 seconds
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [location]);

  const handleLogout = () => {
    authService.logout();
    addToast('Logged out successfully', 'success');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Inbox', path: '/dashboard/inbox', icon: Inbox, badge: unreadCount },
    { name: 'Spam Center', path: '/dashboard/spam', icon: ShieldAlert },
    { name: 'Analytics', path: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
    { name: 'Profile', path: '/dashboard/profile', icon: User },
    { name: 'Admin Panel', path: '/dashboard/admin', icon: ShieldCheck },
  ];

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 glass-panel border-b z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-indigo-500" />
          <span className="font-bold font-display text-lg tracking-wide text-slate-800 dark:text-white">SmartEmail</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 focus:outline-none"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar Navigation Panel */}
      <aside
        className={`fixed inset-y-0 left-0 transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 transition-transform duration-300 ease-in-out z-50 w-64 glass-panel border-r flex flex-col justify-between pt-20 lg:pt-6 h-screen`}
      >
        <div>
          {/* Logo Header */}
          <div className="hidden lg:flex items-center gap-3 px-6 mb-8">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Mail className="h-6 w-6" />
            </div>
            <span className="font-extrabold font-display text-xl tracking-tight text-slate-900 dark:text-white">
              Smart<span className="text-indigo-500">Email</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="px-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  end={item.path === '/dashboard'}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                      isActive
                        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-500'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500 text-white animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer controls & Profile details */}
        <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={user?.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                alt="Profile"
                className="w-10 h-10 rounded-full border border-indigo-500/20"
              />
              <div className="flex flex-col truncate w-32">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-200 truncate">{user?.name}</span>
                <span className="text-[10px] text-slate-500 truncate">{user?.email}</span>
              </div>
            </div>
            
            {/* Theme Switcher Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
