import React from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton,
} from '@ionic/react';
import { chevronBackOutline } from 'ionicons/icons';
import { loadProjects } from '../lib/storage';
import { Room } from '../types/index';
import { useT } from '../lib/i18n';
import './Statistics.css';

const corners = (room: Room) => room.points.length;

const calcClient = (room: Room) => {
  const c = corners(room);
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce((s, seg) => s + seg.profile.price * seg.lengthM + seg.profile.priceCorner, 0);
  const l = (room.lighting ?? []).reduce((s, e) => s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as any).lengthM), 0);
  const a = (room.selectedAccessories ?? []).reduce((s, x) => s + x.accessory.price * x.quantity, 0);
  const sv = (room.selectedServices ?? []).reduce((s, x) => s + x.service.price * x.quantity, 0);
  return f + p + l + a + sv;
};

const calcWorker = (room: Room) => {
  const c = corners(room);
  const f = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce((s, seg) => s + seg.profile.priceInstall * seg.lengthM, 0);
  const l = (room.lighting ?? []).reduce((s, e) => s + (e.kind === 'point' ? e.catalogItem.priceInstall : e.catalogItem.priceInstall * (e as any).lengthM), 0);
  const a = (room.selectedAccessories ?? []).reduce((s, x) => s + x.accessory.priceInstall * x.quantity, 0);
  const sv = (room.selectedServices ?? []).reduce((s, x) => s + x.service.priceInstall * x.quantity, 0);
  return f + p + l + a + sv;
};

const fmt = (n: number) => Math.round(n).toLocaleString('ru');
const fmtDec = (n: number) => n.toFixed(1);

const Statistics: React.FC = () => {
  const { t } = useT();
  const projects = loadProjects();
  const allRooms = projects.flatMap(p => p.rooms.filter(r => r.areaSqm > 0));

  const totalProjects = projects.length;
  const totalRooms = allRooms.length;
  const totalArea = allRooms.reduce((s, r) => s + r.areaSqm, 0);
  const totalPerimeter = allRooms.reduce((s, r) => s + r.perimeterM, 0);
  const avgArea = totalRooms > 0 ? totalArea / totalRooms : 0;

  const totalClient = allRooms.reduce((s, r) => s + calcClient(r), 0);
  const totalWorker = allRooms.reduce((s, r) => s + calcWorker(r), 0);

  // Most used fabric
  const fabricCounts: Record<string, { title: string; count: number }> = {};
  allRooms.forEach(r => {
    if (r.fabric) {
      const key = r.fabricId ?? r.fabric.title;
      if (!fabricCounts[key]) fabricCounts[key] = { title: r.fabric.title, count: 0 };
      fabricCounts[key].count += 1;
    }
  });
  const topFabric = Object.values(fabricCounts).sort((a, b) => b.count - a.count)[0] ?? null;

  // Profile total meters
  const totalProfileM = allRooms.reduce((s, r) => s + (r.profileSegments ?? []).reduce((ps, seg) => ps + seg.lengthM, 0), 0);

  // Lighting
  let totalSpots = 0;
  let totalPathM = 0;
  allRooms.forEach(r => {
    (r.lighting ?? []).forEach(e => {
      if (e.kind === 'point') totalSpots += 1;
      else totalPathM += (e as any).lengthM ?? 0;
    });
  });

  // Monthly activity — last 6 months
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: t(`mon.${d.getMonth()}`), count: 0 });
  }
  projects.forEach(p => {
    const d = new Date(p.createdAt);
    for (let i = 0; i < 6; i++) {
      const ref = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      if (d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()) {
        months[i].count += 1;
      }
    }
  });
  const maxCount = Math.max(...months.map(m => m.count), 1);

  const hasFinance = totalClient > 0;
  const hasLighting = totalSpots > 0 || totalPathM > 0;
  const hasActivity = projects.some(p => {
    const d = new Date(p.createdAt);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return d >= sixMonthsAgo;
  });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/cabinet" />
          </IonButtons>
          <IonTitle>{t('stat.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="stats-content">
        {totalProjects === 0 ? (
          <div className="stats-empty">
            <div className="stats-empty-icon">📊</div>
            <div className="stats-empty-title">{t('stat.emptyTitle')}</div>
            <div className="stats-empty-sub">{t('stat.emptySub')}</div>
          </div>
        ) : (
          <div className="card-list" style={{ paddingBottom: 32 }}>

            {/* Hero */}
            <div className="stats-hero">
              <div className="stats-hero-item">
                <div className="stats-hero-value">{totalProjects}</div>
                <div className="stats-hero-label">{t('stat.projects')}</div>
              </div>
              <div className="stats-hero-sep" />
              <div className="stats-hero-item">
                <div className="stats-hero-value">{totalRooms}</div>
                <div className="stats-hero-label">{t('stat.rooms')}</div>
              </div>
              <div className="stats-hero-sep" />
              <div className="stats-hero-item">
                <div className="stats-hero-value">{fmtDec(totalArea)}</div>
                <div className="stats-hero-label">м²</div>
              </div>
            </div>

            {/* Volume */}
            {totalRooms > 0 && (
              <div className="card stats-card">
                <div className="stats-card-title">{t('stat.volume')}</div>
                <div className="stats-rows">
                  <div className="stats-row">
                    <span className="stats-row-label">{t('stat.fabricArea')}</span>
                    <span className="stats-row-value">{fmtDec(totalArea)} м²</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-row-label">{t('stat.profilePerimeter')}</span>
                    <span className="stats-row-value">{fmtDec(totalPerimeter)} м</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-row-label">{t('stat.avgArea')}</span>
                    <span className="stats-row-value">{fmtDec(avgArea)} м²</span>
                  </div>
                  {totalProfileM > 0 && (
                    <div className="stats-row">
                      <span className="stats-row-label">{t('stat.totalProfile')}</span>
                      <span className="stats-row-value">{fmtDec(totalProfileM)} м</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Finance */}
            {hasFinance && (
              <div className="card stats-card">
                <div className="stats-card-title">{t('stat.finance')}</div>
                <div className="stats-rows">
                  <div className="stats-row">
                    <span className="stats-row-label">{t('stat.totalBudget')}</span>
                    <span className="stats-row-value stats-row-value--primary">{fmt(totalClient)} ₽</span>
                  </div>
                  {totalWorker > 0 && (
                    <div className="stats-row">
                      <span className="stats-row-label">{t('stat.workerPay')}</span>
                      <span className="stats-row-value">{fmt(totalWorker)} ₽</span>
                    </div>
                  )}
                  {totalWorker > 0 && (
                    <div className="stats-row">
                      <span className="stats-row-label">{t('stat.markup')}</span>
                      <span className="stats-row-value">{fmt(totalClient - totalWorker)} ₽</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Materials */}
            {(topFabric || totalProfileM > 0) && (
              <div className="card stats-card">
                <div className="stats-card-title">{t('stat.materials')}</div>
                <div className="stats-rows">
                  {topFabric && (
                    <div className="stats-row">
                      <span className="stats-row-label">{t('stat.topFabric')}</span>
                      <span className="stats-row-value">{topFabric.title}</span>
                    </div>
                  )}
                  {topFabric && Object.keys(fabricCounts).length > 1 && (
                    <div className="stats-row">
                      <span className="stats-row-label" style={{ paddingLeft: 12 }}>{t('stat.usedTimes')}</span>
                      <span className="stats-row-value stats-row-value--muted">{topFabric.count}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Lighting */}
            {hasLighting && (
              <div className="card stats-card">
                <div className="stats-card-title">{t('stat.light')}</div>
                <div className="stats-rows">
                  {totalSpots > 0 && (
                    <div className="stats-row">
                      <span className="stats-row-label">{t('stat.spots')}</span>
                      <span className="stats-row-value">{totalSpots} {t('mc.pcs')}</span>
                    </div>
                  )}
                  {totalPathM > 0 && (
                    <div className="stats-row">
                      <span className="stats-row-label">{t('stat.tracks')}</span>
                      <span className="stats-row-value">{fmtDec(totalPathM)} м</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Monthly activity */}
            {hasActivity && (
              <div className="card stats-card">
                <div className="stats-card-title">{t('stat.activity')}</div>
                <div className="stats-chart">
                  {months.map((m, i) => (
                    <div key={i} className="stats-chart-col">
                      <div className="stats-chart-bar-wrap">
                        <div
                          className="stats-chart-bar"
                          style={{ height: `${Math.round((m.count / maxCount) * 100)}%` }}
                        />
                      </div>
                      {m.count > 0 && (
                        <div className="stats-chart-count">{m.count}</div>
                      )}
                      <div className="stats-chart-label">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Statistics;
