import React from 'react';

const LockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const LockedCard = ({ title, description, platforms }) => (
    <div style={{
        background: 'rgba(15,20,35,0.4)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
        padding: '1.5rem', position: 'relative', overflow: 'hidden'
    }}>
        <div style={{
            position: 'absolute', top: 10, right: 12,
            background: 'rgba(251,191,36,0.15)', color: '#FBBF24',
            fontSize: '0.6rem', padding: '3px 8px', borderRadius: 4,
            fontWeight: 600, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4
        }}>
            <LockIcon /> COMING SOON
        </div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#F0F6FC', fontSize: '0.9375rem', fontWeight: 600 }}>{title}</h3>
        {description && <p style={{ margin: '0 0 1rem', color: '#8B949E', fontSize: '0.8rem', lineHeight: 1.5 }}>{description}</p>}
        {platforms && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {platforms.map(p => (
                    <span key={p} style={{
                        background: 'rgba(99,102,241,0.12)', color: '#818CF8',
                        fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20,
                        border: '1px solid rgba(99,102,241,0.2)', fontWeight: 500
                    }}>{p}</span>
                ))}
            </div>
        )}
        {/* Blurred dummy chart */}
        <div style={{ marginTop: '1.25rem', height: 100, borderRadius: 8, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', opacity: 0.15 }}>
                {[60, 80, 45, 90, 70, 55, 85, 40, 75, 65].map((h, i) => (
                    <div key={i} style={{ width: 18, height: h, background: '#8B5CF6', borderRadius: '3px 3px 0 0' }} />
                ))}
            </div>
        </div>
    </div>
);

const KpiLocked = ({ label }) => (
    <div style={{
        background: 'rgba(15,20,35,0.4)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
        padding: '1rem 1.25rem', flex: 1, minWidth: 140, position: 'relative'
    }}>
        <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'rgba(248,250,252,0.15)', filter: 'blur(4px)', userSelect: 'none' }}>—</div>
        <div style={{
            position: 'absolute', top: 8, right: 10,
            background: 'rgba(251,191,36,0.15)', color: '#FBBF24',
            fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, fontWeight: 600
        }}>COMING SOON</div>
    </div>
);

export default function ReputationManagement() {
    return (
        <div style={{ padding: '0 0 2rem' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(15,20,35,0.8) 0%, rgba(30,41,59,0.6) 50%, rgba(15,20,35,0.8) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16, padding: '1.25rem 2rem', marginBottom: '1.5rem',
                border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid #EC4899',
                display: 'flex', alignItems: 'center', gap: '0.75rem'
            }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <div>
                    <h1 style={{ color: '#F8FAFC', fontSize: '1.25rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg,#F8FAFC 0%,#94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        Reputation Management
                    </h1>
                    <p style={{ margin: '2px 0 0', color: '#64748B', fontSize: '0.75rem' }}>
                        External platform monitoring — Trustpilot · Sitejabber · Prop Firm Match
                    </p>
                </div>
            </div>

            {/* KPI Row */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <KpiLocked label="Trustpilot Rating" />
                <KpiLocked label="Sitejabber Rating" />
                <KpiLocked label="Prop Firm Match Rating" />
                <KpiLocked label="Total Reviews" />
                <KpiLocked label="Positive Review %" />
                <KpiLocked label="Negative Review %" />
            </div>

            {/* Platform Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <LockedCard
                    title="Trustpilot"
                    description="Review trends, star distribution, and response tracking from Trustpilot."
                    platforms={['Rating trend', 'Review volume', 'Response rate']}
                />
                <LockedCard
                    title="Sitejabber"
                    description="Customer review analytics and sentiment breakdown from Sitejabber."
                    platforms={['Rating trend', 'Review volume', 'Sentiment']}
                />
                <LockedCard
                    title="Prop Firm Match"
                    description="Industry-specific reputation tracking and comparison on Prop Firm Match."
                    platforms={['Rating trend', 'Rank tracking', 'Competitor view']}
                />
            </div>

            {/* Bottom charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <LockedCard
                    title="Platform-wise Rating Comparison"
                    description="Side-by-side rating comparison across all tracked review platforms over time."
                />
                <LockedCard
                    title="Review Sentiment Over Time"
                    description="Positive, neutral, and negative review trends aggregated across all platforms."
                />
            </div>

            {/* Info Banner */}
            <div style={{
                marginTop: '1.5rem',
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: 12, padding: '1rem 1.25rem',
                color: '#818CF8', fontSize: '0.82rem', lineHeight: 1.6
            }}>
                <strong>Data Integration Required:</strong> This section will be activated once API integrations with Trustpilot, Sitejabber, and Prop Firm Match are configured. Contact the data team to set up the review data pipeline.
            </div>
        </div>
    );
}
