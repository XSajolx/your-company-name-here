import React, { useState } from 'react';
import SPOTest from './SPOTest';
import WorkflowAutomation from './WorkflowAutomation';
import TopicAnalyzerAdmin from './TopicAnalyzerAdmin';
import PermissionManagement from './PermissionManagement';
import TeamRoster from './TeamRoster';

// Full admins — can access every admin-only tab, including Permission Management.
const ADMIN_EMAILS = ['sajol@nextventures.io', 'sazzad@nextventures.io', 'salmanwahid@nextventures.io', 'dhrubo@nextventures.io', 'sajolmk999@gmail.com', 'afsana@nextventures.io', 'sudipta@nextventures.io', 'walliullah@nextventures.io', 'mirza.shizan@nextventures.io', 'fahim.sarower@nextventures.io'];

// Users who get Topic Analyzer Admin only (no Permission Management). Full admins implicitly have this too.
const TOPIC_ANALYZER_EMAILS = ['fahim.sarower@nextventures.io', 'faisal.niyam@nextventures.io'];

const SUB_TABS = [
  { id: 'spo-test',        label: '🧪 SPO Test',           access: 'all'   },
  { id: 'workflow',        label: 'Workflow Automation',   access: 'all'   },
  { id: 'topic-analyzer',  label: 'Topic Analyzer Admin',  access: 'topic' },
  { id: 'team-roster',     label: 'Team Roster',           access: 'admin' },
  { id: 'permissions',     label: 'Permission Management', access: 'admin' },
];

export default function Settings({ userEmail }) {
  const email = userEmail ? userEmail.toLowerCase() : null;
  const isAdmin = !!email && ADMIN_EMAILS.some(e => e.toLowerCase() === email);
  const canTopicAnalyzer = isAdmin || (!!email && TOPIC_ANALYZER_EMAILS.some(e => e.toLowerCase() === email));

  const canAccess = (tab) => {
    if (tab.access === 'all') return true;
    if (tab.access === 'admin') return isAdmin;
    if (tab.access === 'topic') return canTopicAnalyzer;
    return false;
  };
  const visibleTabs = SUB_TABS.filter(canAccess);
  const [subTab, setSubTab] = useState(visibleTabs[0]?.id || 'spo-test');

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 20, 35, 0.8) 0%, rgba(30, 41, 59, 0.6) 50%, rgba(15, 20, 35, 0.8) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '16px',
        padding: '1.25rem 2rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderLeft: '3px solid #8B5CF6',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <h1 style={{
          color: '#F8FAFC',
          fontSize: '1.25rem',
          fontWeight: '700',
          margin: 0,
          letterSpacing: '-0.01em',
          background: 'linear-gradient(135deg, #F8FAFC 0%, #94A3B8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Settings
        </h1>
      </div>

      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '1.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        padding: '4px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        width: 'fit-content',
      }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: subTab === tab.id ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: subTab === tab.id ? '#C084FC' : '#94A3B8',
              fontSize: '0.875rem',
              fontWeight: subTab === tab.id ? '600' : '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: subTab === 'spo-test' ? 'block' : 'none' }}>
        <SPOTest />
      </div>
      <div style={{ display: subTab === 'workflow' ? 'block' : 'none' }}>
        <WorkflowAutomation />
      </div>
      {canTopicAnalyzer && (
        <div style={{ display: subTab === 'topic-analyzer' ? 'block' : 'none' }}>
          <TopicAnalyzerAdmin />
        </div>
      )}
      {isAdmin && (
        <div style={{ display: subTab === 'team-roster' ? 'block' : 'none' }}>
          <TeamRoster />
        </div>
      )}
      {isAdmin && (
        <div style={{ display: subTab === 'permissions' ? 'block' : 'none' }}>
          <PermissionManagement />
        </div>
      )}
    </div>
  );
}
