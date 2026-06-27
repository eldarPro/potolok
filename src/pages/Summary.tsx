import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
} from '@ionic/react';
import { chevronBackOutline, downloadOutline, shareSocialOutline, callOutline, locationOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject } from '../lib/storage';
import { Room } from '../types';
import jsPDF from 'jspdf';
import './Summary.css';

const corners = (room: Room) => room.points.length;

const calcClient = (room: Room) => {
  const c = corners(room);
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce((sum, seg) => sum + seg.profile.price * seg.lengthM + seg.profile.priceCorner, 0);
  const l = (room.lighting ?? []).reduce((sum, e) => sum + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as any).lengthM), 0);
  const a = (room.selectedAccessories ?? []).reduce((sum, a) => sum + a.accessory.price * a.quantity, 0);
  const sv = (room.selectedServices ?? []).reduce((sum, s) => sum + s.service.price * s.quantity, 0);
  return { fabric: f, profile: p, lighting: l, accessories: a, services: sv, total: f + p + l + a + sv };
};

const calcWorker = (room: Room) => {
  const c = corners(room);
  const f = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce((sum, seg) => sum + seg.profile.priceInstall * seg.lengthM, 0);
  const l = (room.lighting ?? []).reduce((sum, e) => sum + (e.kind === 'point' ? e.catalogItem.priceInstall : e.catalogItem.priceInstall * (e as any).lengthM), 0);
  const a = (room.selectedAccessories ?? []).reduce((sum, a) => sum + a.accessory.priceInstall * a.quantity, 0);
  const sv = (room.selectedServices ?? []).reduce((sum, s) => sum + s.service.priceInstall * s.quantity, 0);
  return f + p + l + a + sv;
};

const getInitials = (name: string) => {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const fmt = (n: number) => Math.round(n).toLocaleString('ru');

const Summary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ReturnType<typeof getProject>>(null);

  useEffect(() => { setProject(getProject(id)); }, [id]);

  if (!project) return null;

  const activeRooms = project.rooms.filter(r => r.areaSqm > 0);
  const totalSqm = activeRooms.reduce((s, r) => s + r.areaSqm, 0);
  const totalClient = activeRooms.reduce((s, r) => s + calcClient(r).total, 0);
  const totalWorker = activeRooms.reduce((s, r) => s + calcWorker(r), 0);

  const buildPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const W = 210;
    const margin = 15;
    let y = 20;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Смета на натяжные потолки', margin, y); y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Клиент: ${project.clientName}`, margin, y); y += 6;
    if (project.phone) { doc.text(`Телефон: ${project.phone}`, margin, y); y += 6; }
    if (project.address) { doc.text(`Адрес: ${project.address}`, margin, y); y += 6; }
    doc.text(`Дата: ${new Date().toLocaleDateString('ru')}`, margin, y); y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, W - margin, y); y += 6;

    activeRooms.forEach((room, i) => {
      const c = corners(room);
      const cl = calcClient(room);

      doc.setFont('helvetica', 'bold');
      doc.text(`${i + 1}. ${room.name}`, margin, y); y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text(`   Площадь: ${room.areaSqm.toFixed(2)} м²  Периметр: ${room.perimeterM.toFixed(2)} м  Углов: ${c}`, margin, y); y += 5;

      if (room.fabric) {
        doc.text(`   Полотно "${room.fabric.title}": ${room.fabric.price} × ${room.areaSqm.toFixed(2)} м² + ${room.fabric.priceCorner} × ${c} угл. = ${fmt(cl.fabric)} ₽`, margin, y); y += 5;
      }
      const segs = room.profileSegments ?? [];
      const pGroups: Record<string, { title: string; totalLengthM: number; count: number; price: number; priceCorner: number }> = {};
      segs.forEach(seg => {
        if (!pGroups[seg.profileId]) pGroups[seg.profileId] = { title: seg.profile.title, totalLengthM: 0, count: 0, price: seg.profile.price, priceCorner: seg.profile.priceCorner };
        pGroups[seg.profileId].totalLengthM += seg.lengthM;
        pGroups[seg.profileId].count += 1;
      });
      Object.values(pGroups).forEach(g => {
        doc.text(`   Профиль "${g.title}": ${g.price} × ${g.totalLengthM.toFixed(2)} м + ${g.priceCorner} × ${g.count} угл. = ${fmt(g.price * g.totalLengthM + g.priceCorner * g.count)} ₽`, margin, y); y += 5;
      });
      doc.setFont('helvetica', 'bold');
      doc.text(`   Итого по помещению: ${fmt(cl.total)} ₽`, margin, y); y += 8;
      doc.setFont('helvetica', 'normal');
    });

    doc.line(margin, y, W - margin, y); y += 8;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`ИТОГО: ${fmt(totalClient)} ₽`, margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${totalSqm.toFixed(2)} м² общей площади)`, margin, y);

    return doc;
  };

  const pdfFileName = `smeta_${project.clientName.replace(/\s+/g, '_')}.pdf`;
  const handlePDF = () => buildPDF().save(pdfFileName);

  const handleShare = async () => {
    const blob = buildPDF().output('blob');
    const file = new File([blob], pdfFileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Смета' });
    } else {
      buildPDF().save(pdfFileName);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${id}`} />
          </IonButtons>
          <IonTitle>Смета</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleShare}>
              <IonIcon slot="icon-only" icon={shareSocialOutline} style={{ color: 'var(--color-primary)' }} />
            </IonButton>
            <IonButton onClick={handlePDF}>
              <IonIcon slot="icon-only" icon={downloadOutline} style={{ color: 'var(--color-primary)' }} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="summary-content">
        <div className="card-list" style={{ paddingBottom: 32 }}>

          {/* ── Client card ── */}
          <div className="card summary-client-card">
            <div className="summary-client-row">
              <div className="avatar avatar--lg" style={{ background: 'var(--color-primary)' }}>
                {getInitials(project.clientName)}
              </div>
              <div className="summary-client-details">
                <div className="summary-client-name">{project.clientName}</div>
                {project.phone && (
                  <div className="summary-contact-row">
                    <IonIcon icon={callOutline} />
                    {project.phone}
                  </div>
                )}
                {project.address && (
                  <div className="summary-contact-row">
                    <IonIcon icon={locationOutline} />
                    {project.address}
                  </div>
                )}
              </div>
            </div>
            <div className="summary-client-date">
              {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* ── Room cards ── */}
          {activeRooms.map((room, i) => {
            const c = corners(room);
            const cl = calcClient(room);
            const wk = calcWorker(room);

            const segs = room.profileSegments ?? [];
            const profileGroups: Record<string, { title: string; totalLengthM: number; count: number; price: number; priceCorner: number }> = {};
            segs.forEach(seg => {
              if (!profileGroups[seg.profileId]) profileGroups[seg.profileId] = { title: seg.profile.title, totalLengthM: 0, count: 0, price: seg.profile.price, priceCorner: seg.profile.priceCorner };
              profileGroups[seg.profileId].totalLengthM += seg.lengthM;
              profileGroups[seg.profileId].count += 1;
            });

            const lightGroups: Record<string, { title: string; count: number; totalLen: number; price: number; isPath: boolean }> = {};
            (room.lighting ?? []).forEach(e => {
              if (!lightGroups[e.catalogItemId]) lightGroups[e.catalogItemId] = { title: e.catalogItem.title, count: 0, totalLen: 0, price: e.catalogItem.price, isPath: e.kind === 'path' };
              lightGroups[e.catalogItemId].count += 1;
              if (e.kind === 'path') lightGroups[e.catalogItemId].totalLen += (e as any).lengthM;
            });

            const hasMaterials = room.fabric || segs.length > 0;
            const lightList = Object.values(lightGroups);
            const accessories = room.selectedAccessories ?? [];
            const services = room.selectedServices ?? [];

            return (
              <div key={room.id} className="card summary-room-card">

                {/* Header */}
                <div className="summary-room-header">
                  <div className="summary-room-badge">{i + 1}</div>
                  <span className="summary-room-name">{room.name}</span>
                  {cl.total > 0 && <span className="summary-room-total">{fmt(cl.total)} ₽</span>}
                </div>

                {/* Dimensions */}
                <div className="summary-dims">
                  <div className="summary-dim">
                    <span className="summary-dim__value">{room.areaSqm.toFixed(2)}</span>
                    <span className="summary-dim__label">м²</span>
                  </div>
                  <div className="summary-dim-sep" />
                  <div className="summary-dim">
                    <span className="summary-dim__value">{room.perimeterM.toFixed(2)}</span>
                    <span className="summary-dim__label">м периметр</span>
                  </div>
                  <div className="summary-dim-sep" />
                  <div className="summary-dim">
                    <span className="summary-dim__value">{c}</span>
                    <span className="summary-dim__label">углов</span>
                  </div>
                </div>

                {/* Materials */}
                {hasMaterials && (
                  <>
                    <div className="summary-section-label">Материалы</div>
                    <div className="summary-line-items">
                      {room.fabric && (
                        <div className="summary-line-item">
                          <div className="summary-line-item__name">{room.fabric.title}</div>
                          <div className="summary-line-item__calc">
                            {room.fabric.price} ₽ × {room.areaSqm.toFixed(2)} м²
                            {c > 0 && ` + ${room.fabric.priceCorner} ₽ × ${c} угл.`}
                          </div>
                          <div className="summary-line-item__total">{fmt(cl.fabric)} ₽</div>
                        </div>
                      )}
                      {Object.values(profileGroups).map(g => (
                        <div key={g.title} className="summary-line-item">
                          <div className="summary-line-item__name">{g.title}</div>
                          <div className="summary-line-item__calc">
                            {g.price} ₽ × {g.totalLengthM.toFixed(2)} м
                            {g.count > 0 && ` + ${g.priceCorner} ₽ × ${g.count} угл.`}
                          </div>
                          <div className="summary-line-item__total">{fmt(g.price * g.totalLengthM + g.priceCorner * g.count)} ₽</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Lighting */}
                {lightList.length > 0 && (
                  <>
                    <div className="summary-section-label">Освещение</div>
                    <div className="summary-line-items">
                      {lightList.map(g => (
                        <div key={g.title} className="summary-line-item">
                          <div className="summary-line-item__name">{g.title}</div>
                          <div className="summary-line-item__calc">
                            {g.isPath ? `${g.totalLen.toFixed(2)} м` : `${g.count} шт`}
                          </div>
                          <div className="summary-line-item__total">{fmt(g.isPath ? g.price * g.totalLen : g.price * g.count)} ₽</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Accessories */}
                {accessories.length > 0 && (
                  <>
                    <div className="summary-section-label">Аксессуары</div>
                    <div className="summary-line-items">
                      {accessories.map(a => (
                        <div key={a.id} className="summary-line-item">
                          <div className="summary-line-item__name">{a.accessory.title}</div>
                          <div className="summary-line-item__calc">{a.quantity} {a.accessory.unit}</div>
                          <div className="summary-line-item__total">{fmt(a.accessory.price * a.quantity)} ₽</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Services */}
                {services.length > 0 && (
                  <>
                    <div className="summary-section-label">Услуги</div>
                    <div className="summary-line-items">
                      {services.map(s => (
                        <div key={s.id} className="summary-line-item">
                          <div className="summary-line-item__name">{s.service.title}</div>
                          <div className="summary-line-item__calc">{s.quantity} ед.</div>
                          <div className="summary-line-item__total">{fmt(s.service.price * s.quantity)} ₽</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Worker salary */}
                {wk > 0 && (
                  <div className="summary-worker-row">
                    <span>Зарплата бригаде</span>
                    <span>{fmt(wk)} ₽</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Total card ── */}
          <div className="summary-total-card">
            <div className="summary-total-label">Итого к оплате</div>
            <div className="summary-total-price">{fmt(totalClient)} ₽</div>
            <div className="summary-total-meta">
              {totalSqm.toFixed(2)} м² · {activeRooms.length} {activeRooms.length === 1 ? 'помещение' : activeRooms.length < 5 ? 'помещения' : 'помещений'}
            </div>
            {totalWorker > 0 && (
              <div className="summary-total-worker">
                Зарплата бригаде: {fmt(totalWorker)} ₽
              </div>
            )}
          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Summary;
