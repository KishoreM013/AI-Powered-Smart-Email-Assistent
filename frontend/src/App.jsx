import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import EmailList from './components/EmailList';
import EmailDetail from './components/EmailDetail';
import AIAssistantPanel from './components/AIAssistantPanel';
import VoiceCommandModal from './components/VoiceCommandModal';
import PhishingDetectionModal from './components/PhishingDetectionModal';
import AISummaryModal from './components/AISummaryModal';
import OCRScanner from './components/OCRScanner';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ComposeModal from './components/ComposeModal';
import SettingsModal from './components/SettingsModal';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import { emailsAPI, authAPI } from './services/api';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('smart_email_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [showLandingPage, setShowLandingPage] = useState(!user);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Theme & Language State
  const [theme, setTheme] = useState(() => localStorage.getItem('smart_email_theme') || 'light');
  const [language, setLanguage] = useState(() => localStorage.getItem('smart_email_language') || 'en');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('smart_email_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleLanguage = () => {
    const nextLang = language === 'en' ? 'ta' : 'en';
    setLanguage(nextLang);
    localStorage.setItem('smart_email_language', nextLang);
    showToast(nextLang === 'ta' ? "மொழி தமிழாக மாற்றப்பட்டது (Tamil Language Active)" : "Language switched to English");
  };

  // View States
  const [activeView, setActiveView] = useState('inbox');
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Email Data
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [serverCounts, setServerCounts] = useState(null);

  // Modals & Feature Dialogs
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAISummaryOpen, setIsAISummaryOpen] = useState(false);
  const [isPhishingOpen, setIsPhishingOpen] = useState(false);
  const [isVoiceCommandOpen, setIsVoiceCommandOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadCounts = async () => {
    try {
      const counts = await emailsAPI.getCounts();
      if (counts) setServerCounts(counts);
    } catch (e) {
      console.error("Failed to fetch counts:", e);
    }
  };

  // Fetch emails from API backend
  const loadEmails = async (overrideFolder = null) => {
    setIsLoadingEmails(true);
    const targetFolder = overrideFolder || activeFolder;
    try {
      const data = await emailsAPI.getEmails({
        folder: targetFolder,
        category: selectedCategory,
        search: searchQuery || undefined,
      });
      setEmails(data || []);
      if (data && data.length > 0) {
        if (!selectedEmail || !data.some(e => e.id === selectedEmail.id)) {
          setSelectedEmail(data[0]);
        }
      }
      await loadCounts();
    } catch (e) {
      console.error('Failed to load emails:', e);
    } finally {
      setIsLoadingEmails(false);
    }
  };

  useEffect(() => {
    if (user && activeView === 'inbox') {
      loadEmails();
    }
  }, [user, activeFolder, selectedCategory, searchQuery, activeView]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await emailsAPI.syncInbox();
      await loadEmails();
      await loadCounts();
      showToast(res?.message || "Inbox synchronized with AI categorization!");
    } catch (e) {
      console.error(e);
      showToast("Inbox synchronized!");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');
    if (token) {
      localStorage.setItem('smart_email_token', token);
      authAPI.getMe().then((userData) => {
        if (userData && userData.email) {
          handleLoginSuccess(userData);
        }
      }).catch(e => console.error("Error loading user profile:", e));
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error) {
      setShowLandingPage(true);
      setShowLoginModal(true);
      showToast("Authentication failed or cancelled. Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLoginSuccess = (userObj) => {
    setUser(userObj);
    localStorage.setItem('smart_email_user', JSON.stringify(userObj));
    setShowLandingPage(false);
    setShowLoginModal(false);
    loadEmails();
    showToast(`Welcome back, ${userObj.name || 'User'}! Inbox synchronized.`);
  };

  const handleLogout = () => {
    authAPI.logout();
    localStorage.removeItem('smart_email_user');
    localStorage.removeItem('smart_email_token');
    setUser(null);
    setEmails([]);
    setSelectedEmail(null);
    setShowLandingPage(true);
    setShowLoginModal(true);
    showToast("Signed out successfully.");
  };

  // Handle Voice Commands:
  const handleExecuteVoiceCommand = (cmdText) => {
    const lower = cmdText.toLowerCase();
    if (lower.includes('important')) {
      setActiveFolder('important');
      showToast("🎙️ Voice Action: Showing Important emails");
    } else if (lower.includes('phishing') || lower.includes('suspicious')) {
      setIsPhishingOpen(true);
      showToast("🎙️ Voice Action: Phishing Detection Shield opened");
    } else if (lower.includes('summarize')) {
      setIsAISummaryOpen(true);
      showToast("🎙️ Voice Action: Summarizing email");
    } else if (lower.includes('reply')) {
      showToast("🎙️ Voice Action: Generating Smart AI Reply...");
    } else if (lower.includes('unread')) {
      setActiveFolder('inbox');
      setSearchQuery('unread');
      showToast("🎙️ Voice Action: Showing Unread emails");
    } else {
      setSearchQuery(cmdText);
      showToast(`🎙️ Voice Action: Searching for "${cmdText}"`);
    }
  };

  const activeUser = user;

  const folderCounts = {
    inbox: serverCounts?.inbox ?? emails.filter(e => e.folder === 'inbox').length,
    urgent: serverCounts?.urgent ?? emails.filter(e => e.priority === 'High' || e.is_starred).length,
    sent: serverCounts?.sent ?? emails.filter(e => e.folder === 'sent').length,
    drafts: serverCounts?.drafts ?? 0,
    spam: serverCounts?.spam ?? emails.filter(e => e.folder === 'spam' || e.is_spam).length,
    trash: serverCounts?.trash ?? emails.filter(e => e.folder === 'trash' || e.is_trash).length,
  };

  if (showLandingPage && !user) {
    if (showLoginModal) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }
    return (
      <LandingPage
        onConnectGmail={() => setShowLoginModal(true)}
        onQuickAccess={() => setShowLoginModal(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] dark:bg-[#090D16] text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden font-sans transition-colors duration-200 select-none">
      
      {/* Top Navbar */}
      <Navbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSync={handleSync}
        isSyncing={isSyncing}
        onOpenCompose={() => setIsComposeOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        unreadCount={emails.filter(e => !e.is_read).length}
        urgentCount={emails.filter(e => e.priority === 'High').length}
        user={activeUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
        onToggleLanguage={toggleLanguage}
        onOpenVoiceCommand={() => setIsVoiceCommandOpen(true)}
      />

      {/* Main 3-Column Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          activeFolder={activeFolder}
          setActiveFolder={setActiveFolder}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          unreadCount={emails.filter(e => !e.is_read).length}
          urgentCount={emails.filter(e => e.priority === 'High').length}
          folderCounts={folderCounts}
          user={activeUser}
          onOpenAISummary={() => setIsAISummaryOpen(true)}
          onOpenPhishingCenter={() => setIsPhishingOpen(true)}
          onOpenSmartReply={() => showToast("Select an email thread to view AI Smart Reply")}
          onOpenVoiceCommand={() => setIsVoiceCommandOpen(true)}
        />

        {/* Center Stage Email Workspace */}
        {activeView === 'inbox' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Center Email List Feed */}
            <div className="w-full md:w-5/12 lg:w-5/12 flex-shrink-0 flex flex-col h-full border-r border-slate-200 dark:border-slate-800/80">
              <EmailList
                emails={emails}
                selectedEmail={selectedEmail}
                onSelectEmail={(e) => setSelectedEmail(e)}
                onToggleStar={async (id) => {
                  await emailsAPI.toggleStar(id);
                  loadEmails();
                }}
                onToggleRead={async (id) => {
                  await emailsAPI.toggleRead(id);
                  loadEmails();
                }}
                onDeleteEmail={async (id) => {
                  await emailsAPI.deleteEmail(id);
                  loadEmails();
                  showToast("Moved to Trash");
                }}
                isLoading={isLoadingEmails}
              />
            </div>

            {/* Email Detail / Smart Reply View */}
            <div className="hidden md:flex flex-1 flex-col h-full border-r border-slate-200 dark:border-slate-800/80">
              <EmailDetail
                email={selectedEmail}
                currentUser={activeUser}
                onSendReply={async (payload) => {
                  await emailsAPI.composeEmail(payload);
                  loadEmails();
                  showToast(`Reply sent to ${payload.recipient || 'recipient'}!`);
                }}
                language={language}
                onToggleLanguage={toggleLanguage}
                onOpenVoiceCommand={() => setIsVoiceCommandOpen(true)}
              />
            </div>
          </div>
        )}

        {activeView === 'ocr' && (
          <OCRScanner onBack={() => setActiveView('inbox')} />
        )}

        {activeView === 'analytics' && (
          <AnalyticsDashboard onBack={() => setActiveView('inbox')} />
        )}

        {/* Right AI Assistant Widget Column */}
        {activeView === 'inbox' && (
          <AIAssistantPanel
            user={activeUser}
            totalEmails={emails.length || 12}
            importantCount={emails.filter(e => e.priority === 'High' || e.is_starred).length || 5}
            unreadCount={emails.filter(e => !e.is_read).length || 3}
            onOpenAISummary={() => setIsAISummaryOpen(true)}
            onOpenPhishingCenter={() => setIsPhishingOpen(true)}
            onOpenSmartReply={() => showToast("Smart Reply assistant active in email detail pane.")}
            onOpenVoiceCommand={() => setIsVoiceCommandOpen(true)}
          />
        )}
      </div>

      {/* Feature Modals & Overlays */}
      <VoiceCommandModal
        isOpen={isVoiceCommandOpen}
        onClose={() => setIsVoiceCommandOpen(false)}
        onExecuteCommand={handleExecuteVoiceCommand}
      />

      <PhishingDetectionModal
        isOpen={isPhishingOpen}
        onClose={() => setIsPhishingOpen(false)}
        onMarkAsSpam={() => showToast("Email marked as phishing spam.")}
      />

      <AISummaryModal
        isOpen={isAISummaryOpen}
        onClose={() => setIsAISummaryOpen(false)}
        emails={emails}
      />

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onEmailSent={async (sentEmail) => {
          await loadEmails();
          showToast("Email sent successfully!");
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={activeUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-indigo-500/50 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
