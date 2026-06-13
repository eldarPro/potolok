import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonText,
} from '@ionic/react';
import { chevronBackOutline, downloadOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject } from '../lib/storage';
import { Project, Room } from '../types';
import { edgeLabel } from '../lib/geometry';
import jsPDF from 'jspdf';

const corners = (room: Room) => room.points.length;

const calcClient = (room: Room) => {
  const c = corners(room);
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce(
    (sum, seg) => sum + seg.profile.price * seg.lengthM + seg.profile.priceCorner,
    0,
  );
  return { fabric: f, profile: p, total: f + p };
};

const calcWorker = (room: Room) => {
  const c = corners(room);
  const f = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce(
    (sum, seg) => sum + seg.profile.priceInstall * seg.lengthM,
    0,
  );
  return f + p;
};

const Summary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setProject(getProject(id)); }, [id]);

  if (!project) return null;

  const totalSqm = project.rooms.reduce((s, r) => s + r.areaSqm, 0);
  const totalClient = project.rooms.reduce((s, r) => s + calcClient(r).total, 0);
  const totalWorker = project.rooms.reduce((s, r) => s + calcWorker(r), 0);

  const handlePDF = () => {
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

    project.rooms.forEach((room, i) => {
      if (room.areaSqm === 0) return;
      const c = corners(room);
      const cl = calcClient(room);

      doc.setFont('helvetica', 'bold');
      doc.text(`${i + 1}. ${room.name}`, margin, y); y += 6;
      doc.setFont('helvetica', 'normal');
      doc.text(`   Площадь: ${room.areaSqm.toFixed(2)} м²  Периметр: ${room.perimeterM.toFixed(2)} м  Углов: ${c}`, margin, y); y += 5;

      if (room.fabric) {
        doc.text(`   Полотно "${room.fabric.title}": ${room.fabric.price} × ${room.areaSqm.toFixed(2)} м² + ${room.fabric.priceCorner} × ${c} угл. = ${Math.round(cl.fabric).toLocaleString('ru')} ₽`, margin, y); y += 5;
      }
      const segs = room.profileSegments ?? [];
      const pGroups: Record<string, { title: string; totalLengthM: number; count: number; price: number; priceCorner: number }> = {};
      segs.forEach(seg => {
        if (!pGroups[seg.profileId]) pGroups[seg.profileId] = { title: seg.profile.title, totalLengthM: 0, count: 0, price: seg.profile.price, priceCorner: seg.profile.priceCorner };
        pGroups[seg.profileId].totalLengthM += seg.lengthM;
        pGroups[seg.profileId].count += 1;
      });
      Object.values(pGroups).forEach(g => {
        doc.text(`   Профиль "${g.title}": ${g.price} × ${g.totalLengthM.toFixed(2)} м + ${g.priceCorner} × ${g.count} угл. = ${Math.round(g.price * g.totalLengthM + g.priceCorner * g.count).toLocaleString('ru')} ₽`, margin, y); y += 5;
      });
      doc.setFont('helvetica', 'bold');
      doc.text(`   Итого по помещению: ${Math.round(cl.total).toLocaleString('ru')} ₽`, margin, y); y += 8;
      doc.setFont('helvetica', 'normal');
    });

    doc.line(margin, y, W - margin, y); y += 8;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`ИТОГО: ${Math.round(totalClient).toLocaleString('ru')} ₽`, margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${totalSqm.toFixed(2)} м² общей площади)`, margin, y);

    doc.save(`smeta_${project.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${id}`} />
          </IonButtons>
          <IonTitle>Смета</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handlePDF}>
              <IonIcon slot="icon-only" icon={downloadOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div ref={printRef} style={{ padding: 16 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 6px' }}>{project.clientName}</h2>
            {project.phone && <IonText color="medium"><p style={{ margin: '2px 0', fontSize: 14 }}>{project.phone}</p></IonText>}
            {project.address && <IonText color="medium"><p style={{ margin: '2px 0', fontSize: 14 }}>{project.address}</p></IonText>}
            <IonText color="medium"><p style={{ margin: '6px 0 0', fontSize: 13 }}>{new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</p></IonText>
          </div>

          {project.rooms.map((room, i) => {
            if (room.areaSqm === 0) return null;
            const c = corners(room);
            const cl = calcClient(room);
            const wk = calcWorker(room);

            return (
              <div key={room.id} style={{ marginBottom: 16, padding: 16, background: 'var(--ion-color-light)', borderRadius: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <IonText><b>{i + 1}. {room.name}</b></IonText>
                  {cl.total > 0 && <IonText color="primary"><b>{Math.round(cl.total).toLocaleString('ru')} ₽</b></IonText>}
                </div>

                <Row label="Площадь" value={`${room.areaSqm.toFixed(2)} м²`} />
                <Row label="Периметр" value={`${room.perimeterM.toFixed(2)} м`} />
                <Row label="Углов" value={`${c}`} />

                {(room.fabric || (room.profileSegments ?? []).length > 0) && <div style={{ height: 8 }} />}

                {room.fabric && (
                  <>
                    <Row label={`Полотно: ${room.fabric.title}`} value="" />
                    <Row label={`  ${room.fabric.price} ₽ × ${room.areaSqm.toFixed(2)} м²`} value={`${Math.round(room.fabric.price * room.areaSqm).toLocaleString('ru')} ₽`} />
                    {c > 0 && <Row label={`  Углы: ${room.fabric.priceCorner} ₽ × ${c}`} value={`${Math.round(room.fabric.priceCorner * c).toLocaleString('ru')} ₽`} />}
                  </>
                )}
                {(() => {
                  const segs = room.profileSegments ?? [];
                  const groups: Record<string, { title: string; totalLengthM: number; count: number; price: number; priceCorner: number }> = {};
                  segs.forEach(seg => {
                    if (!groups[seg.profileId]) groups[seg.profileId] = { title: seg.profile.title, totalLengthM: 0, count: 0, price: seg.profile.price, priceCorner: seg.profile.priceCorner };
                    groups[seg.profileId].totalLengthM += seg.lengthM;
                    groups[seg.profileId].count += 1;
                  });
                  return Object.values(groups).map(g => (
                    <React.Fragment key={g.title}>
                      <Row label={`Профиль: ${g.title}`} value="" />
                      <Row label={`  ${g.price} ₽ × ${g.totalLengthM.toFixed(2)} м`} value={`${Math.round(g.price * g.totalLengthM).toLocaleString('ru')} ₽`} />
                      {g.count > 0 && <Row label={`  Углы: ${g.priceCorner} ₽ × ${g.count}`} value={`${Math.round(g.priceCorner * g.count).toLocaleString('ru')} ₽`} />}
                    </React.Fragment>
                  ));
                })()}

                {!room.fabric && (room.profileSegments ?? []).length === 0 && (
                  <IonText color="warning"><small>Материал не выбран</small></IonText>
                )}

                {wk > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--ion-border-color)' }}>
                    <Row label="Зарплата бригаде" value={`${Math.round(wk).toLocaleString('ru')} ₽`} muted />
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ padding: 20, background: 'var(--ion-color-primary)', borderRadius: 16, color: '#fff', marginTop: 8 }}>
            <div style={{ fontSize: 14, marginBottom: 4, opacity: 0.85 }}>Общая площадь: {totalSqm.toFixed(2)} м²</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Итого: {Math.round(totalClient).toLocaleString('ru')} ₽</div>
            {totalWorker > 0 && (
              <div style={{ fontSize: 13, marginTop: 6, opacity: 0.8 }}>
                Зарплата бригаде: {Math.round(totalWorker).toLocaleString('ru')} ₽
              </div>
            )}
          </div>

          <div style={{ padding: '16px 0' }}>
            <IonButton expand="block" onClick={handlePDF}>
              <IonIcon slot="start" icon={downloadOutline} />
              Скачать PDF
            </IonButton>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

const Row: React.FC<{ label: string; value: string; muted?: boolean }> = ({ label, value, muted }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
    <IonText color={muted ? 'medium' : 'medium'}><small>{label}</small></IonText>
    {value && <IonText color={muted ? 'medium' : undefined}><small><b>{value}</b></small></IonText>}
  </div>
);

export default Summary;
