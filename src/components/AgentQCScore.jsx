import React from 'react';

const LockIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const LockedKpi = ({ label, hint }) => (
    <div style={{
        background: 'rgba(15,20,35,0.4)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
        padding: '1rem 1.25rem', flex: 1, minWidth: 140, position: 'relative'
    }}>
        <div style={{
            position: 'absolute', top: 8, right: 10,
            background: 'rgba(251,191,36,0.15)', color: '#FBBF24',
            fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 3
        }}>
            <LockIcon /> ON HOLD
        </div>
        <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'rgba(248,250,252,0.15)', filter: 'blur(3px)', userSelect: 'none' }}>x%</div>
        {hint && <div style={{ fontSize: '0.68rem', color: '#4B5563', marginTop: 4 }}>{hint}</div>}
    </div>
);

const LockedChart = ({ title, description }) => (
    <div style={{
        background: 'rgba(15,20,35,0.4)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
        padding: '1.5rem', position: 'relative', overflow: 'hidden'
    }}>
        <div style={{
            position: 'absolute', top: 12, right: 14,
            background: 'rgba(251,191,36,0.15)', color: '#FBBF24',
            fontSize: '0.6rem', padding: '3px 8px', borderRadius: 4,
            fontWeight: 600, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4
        }}>
            <LockIcon /> COMING SOON
        </div>
        <h3 style={{ margin: '0 0 0.4rem', color: '#F0F6FC', fontSize: '0.9375rem', fontWeight: 600 }}>{title}</h3>
        {description && <p style={{ margin: 0, color: '#8B949E', fontSize: '0.78rem', lineHeight: 1.5 }}>{description}</p>}
        {/* Dummy blurred table */}
        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.12 }}>
            {[85, 78, 92, 71, 88, 66].map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 80, height: 10, background: '#94A3B8', borderRadius: 4 }} />
                    <div style={{ flex: 1, height: 10, background: '#8B5CF6', borderRadius: 4, maxWidth: `${v}%` }} />
                    <div style={{ width: 30, fontSize: '0.7rem', color: '#8B949E' }}>{v}%</div>
                </div>
            ))}
        </div>
    </div>
);

export default function AgentQCScore() {
    return (
        <div style={{ padding: '0 0 2rem' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(15,20,35,0.8) 0%, rgba(30,41,59,0.6) 50%, rgba(15,20,35,0.8) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16, padding: '1.25rem 2rem', marginBottom: '1.5rem',
                border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid #F59E0B',
                display: 'flex', alignItems: 'center', gap: '0.75rem'
            }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <div>
                    <h1 style={{ color: '#F8FAFC', fontSize: '1.25rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg,#F8FAFC 0%,#94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        Agent QC Score
                    </h1>
                    <p style={{ margin: '2px 0 0', color: '#64748B', fontSize: '0.75rem' }}>
                        Quality Control scores by agent, team, and topic — powered by CQMS
                    </p>
                </div>
            </div>

            {/* KPI Row */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <LockedKpi label="Avg QC Score" hint="Team average" />
                <LockedKpi label="Audits Completed" hint="This period" />
                <LockedKpi label="Pass Rate (≥ 85%)" hint="% of audits passing" />
                <LockedKpi label="Critical Failures" hint="Score < 70%" />
                <LockedKpi label="FCR Rate" hint="First contact resolution" />
                <LockedKpi label="Customer Effort Score" hint="CES composite" />
            </div>

            {/* Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <LockedChart
                    title="QC Score by Agent"
                    description="Ranked bar chart of individual agent QC scores for the selected period."
                />
                <LockedChart
                    title="QC Score by Topic"
                    description="Average QC score broken down by conversation topic category."
                />
                <LockedChart
                    title="QC Score Trend Over Time"
                    description="Team-level QC score trend — daily or weekly averages with goal line."
                />
                <LockedChart
                    title="Score Distribution"
                    description="Distribution of audit scores across score bands (90-100, 80-89, 70-79, <70)."
                />
            </div>

            {/* Info Banner */}
            <div style={{
                marginTop: '1.5rem',
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: 12, padding: '1rem 1.25rem',
                color: '#FCD34D', fontSize: '0.82rem', lineHeight: 1.6
            }}>
                <strong>Integration Required:</strong> QC Score data will be pulled from CQMS once the data pipeline is configured. Metrics include First Contact Resolution (FCR), Customer Effort Score (CES), and per-agent audit results. Contact the data team to enable this section.
            </div>
        </div>
    );
}
