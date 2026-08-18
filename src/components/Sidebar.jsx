import React from 'react';
import { motion } from 'motion/react';
import './Sidebar.css';

// Motion orchestration for the nav list
const navList = {
    hidden: {},
    show: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
};
const navItemV = {
    hidden: { opacity: 0, x: -14 },
    show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 400, damping: 32 } },
};

const Icons = {
    Logout: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
    ),
    User: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
        </svg>
    ),
    Topics: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
    ),
    CSAT: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
    ),
    Inflow: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
    ),
    Ticket: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v2a3 3 0 0 1 3 3 3 3 0 0 1-3 3v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1-3-3 3 3 0 0 1 3-3V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"></path>
        </svg>
    ),
    Performance: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
    ),
    Country: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
    ),
    Sentiment: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
    ),
    Feedback: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <line x1="12" y1="7" x2="12" y2="13"></line>
            <line x1="9" y1="10" x2="15" y2="10"></line>
        </svg>
    ),
    TopicInsights: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="10" r="3"></circle>
            <path d="M12 13v2"></path>
        </svg>
    ),
    ChevronLeft: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
    ),
    Logo: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
            <line x1="12" y1="22" x2="12" y2="15.5"></line>
            <polyline points="22 8.5 12 15.5 2 8.5"></polyline>
            <polyline points="12 2 12 8.5"></polyline>
        </svg>
    ),
    Admin: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    ),
    TrustPilot: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    ),
    Evaluation: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
    )
};

// Full admins — see Settings with every admin tab (incl. Permission Management)
const ADMIN_EMAILS = ['sajol@nextventures.io', 'sazzad@nextventures.io', 'salmanwahid@nextventures.io', 'dhrubo@nextventures.io', 'sajolmk999@gmail.com', 'afsana@nextventures.io', 'sudipta@nextventures.io', 'walliullah@nextventures.io', 'mirza.shizan@nextventures.io', 'fahim.sarower@nextventures.io'];

// Topic-Analyzer-only users — see Settings (Topic Analyzer Admin tab only, no Permission Management). Keep in sync with Settings.jsx TOPIC_ANALYZER_EMAILS.
const TOPIC_ANALYZER_EMAILS = ['fahim.sarower@nextventures.io', 'faisal.niyam@nextventures.io'];

// Supervisors who may see the Supervisors Evaluation tab. Keep in sync with App.jsx SUPERVISOR_EVAL_EMAILS.
const SUPERVISOR_EVAL_EMAILS = ['sajol@nextventures.io', 'sazzad@nextventures.io', 'salmanwahid@nextventures.io', 'dhrubo@nextventures.io', 'sajolmk999@gmail.com', 'afsana@nextventures.io', 'sudipta@nextventures.io', 'walliullah@nextventures.io', 'mirza.shizan@nextventures.io'];

// Only these emails can see the API Usage tab
const API_USAGE_EMAILS = [
    'faiyaz@nextventures.io',
    'salmanwahid@nextventures.io',
    'dhrubo@nextventures.io',
    'sajol@nextventures.io',
    'mirza.shizan@nextventures.io',
    'sazzad@nextventures.io',
    'sajolmk999@gmail.com'
];

const TP_SUBTABS = [
    { id: 'main',    label: 'Main Dashboard',  path: '/tp/' },
    { id: 'compare', label: 'Compare',         path: '/tp/compare' },
    { id: 'reply',   label: 'Reply Analysis',  path: '/tp/tp-reply-analysis' },
    { id: 'meeting', label: 'Meeting Review',  path: '/tp/tp-meeting-review' },
];

const Sidebar = ({ activeTab, onTabChange, isCollapsed, onToggle, onSignOut, userEmail, userAvatarUrl, tpSubTab, onTpSubTabChange }) => {
    // Check if current user is admin
    const isAdmin = userEmail && ADMIN_EMAILS.some(
        email => email.toLowerCase() === userEmail.toLowerCase()
    );
    const canSeeApiUsage = userEmail && API_USAGE_EMAILS.some(
        email => email.toLowerCase() === userEmail.toLowerCase()
    );
    // Open to every signed-in user; the page scopes the agent dropdown by role.
    const canSeeSupervisorEval = !!userEmail;
    const canSeeSettings = isAdmin || (userEmail && TOPIC_ANALYZER_EMAILS.some(
        email => email.toLowerCase() === userEmail.toLowerCase()
    ));

    const baseMenuItems = [
        { id: 'trustpilot', label: 'Trustpilot', icon: <Icons.TrustPilot /> },
        { id: 'intercom', label: 'Conversation Topics', icon: <Icons.Topics /> },
        { id: 'csat', label: 'CSAT', icon: <Icons.CSAT /> },
        { id: 'sentiment', label: 'Sentiment Analysis', icon: <Icons.Sentiment /> },
        { id: 'feedback', label: 'Feedback & Suggestions', icon: <Icons.Feedback /> },
        { id: 'service-performance', label: 'Performance Overview', icon: <Icons.TopicInsights /> },
        { id: 'tickets', label: 'Ticket Analytics', icon: <Icons.Ticket /> },
        { id: 'sales', label: 'Capacity Management', icon: <Icons.TopicInsights /> },
        { id: 'sales-dashboard', label: 'Sales', icon: <Icons.Country /> },
        { id: 'daily-report', label: 'Daily Report', icon: <Icons.Performance /> }
    ];

    // Add restricted tabs based on user email
    let menuItems = [...baseMenuItems];
    if (canSeeSupervisorEval) {
        menuItems.push({ id: 'supervisor-eval', label: 'Supervisors Evaluation', icon: <Icons.Evaluation /> });
    }
    if (canSeeApiUsage) {
        menuItems.push({ id: 'api-usage', label: 'OpenAI API Usages', icon: <Icons.Performance /> });
    }
    if (canSeeSettings) {
        menuItems.push({ id: 'settings', label: 'Settings', icon: <Icons.Admin /> });
    }

    return (
        <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-brand">
                    <div className="brand-logo">
                        <img src={`${import.meta.env.BASE_URL}logo-4s.svg`} alt="4S" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                    </div>
                    <span className="brand-title">Your company name here</span>
                </div>
                <button className="collapse-btn" onClick={onToggle}>
                    <Icons.ChevronLeft />
                </button>
            </div>

            <motion.nav className="sidebar-nav" variants={navList} initial="hidden" animate="show">
                {menuItems.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                        <React.Fragment key={item.id}>
                            <motion.div
                                className={`nav-item ${isActive ? 'active' : ''}`}
                                onClick={() => onTabChange(item.id)}
                                data-tooltip={item.label}
                                variants={navItemV}
                                whileHover={{ x: isCollapsed ? 0 : 4 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                <span className="nav-label">{item.label}</span>
                            </motion.div>
                            {item.id === 'trustpilot' && isActive && !isCollapsed && (
                                <div style={{ paddingLeft: '0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {TP_SUBTABS.map(sub => (
                                        <div
                                            key={sub.id}
                                            onClick={() => onTpSubTabChange(sub.id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                                                fontSize: '0.8125rem', fontWeight: '400',
                                                color: tpSubTab === sub.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                background: tpSubTab === sub.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <span style={{
                                                width: 6, height: 6, borderRadius: '50%',
                                                background: tpSubTab === sub.id ? '#00b67a' : 'var(--text-secondary)',
                                                opacity: tpSubTab === sub.id ? 1 : 0.4, flexShrink: 0,
                                            }} />
                                            {sub.label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </motion.nav>

            {/* User Section */}
            {userEmail && (
                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar" style={userAvatarUrl ? { borderRadius: '50%', overflow: 'hidden', padding: 0 } : {}}>
                            {userAvatarUrl ? (
                                <img
                                    src={userAvatarUrl}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <Icons.User />
                            )}
                        </div>
                        <span className="user-email" title={userEmail}>
                            {userEmail.split('@')[0].charAt(0).toUpperCase() + userEmail.split('@')[0].slice(1)}
                        </span>
                    </div>
                    <button 
                        className="logout-btn" 
                        onClick={onSignOut}
                        title="Sign Out"
                    >
                        <Icons.Logout />
                        <span className="logout-label">Sign Out</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
