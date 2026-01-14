import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { Save, Eraser, CheckCircle, PenTool, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

const AgreementsPage = () => {
    const { eventId } = useParams();
    const [events, setEvents] = useLocalStorage('cardshow_events', []);

    // Derived State
    const eventIndex = events.findIndex(e => e.id === eventId);
    const event = events[eventIndex];
    const vendors = event?.vendors || []; // Scoped
    const agreements = event?.agreements || [];

    const [agreementText, setAgreementText] = useLocalStorage('cardshow_agreement_text', 'By signing below, the Vendor agrees to the terms...');
    const [selectedVendorId, setSelectedVendorId] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    const sigPad = useRef({});

    const updateEventAgreements = (newAgreements) => {
        const updatedEvents = [...events];
        updatedEvents[eventIndex] = { ...event, agreements: newAgreements };
        setEvents(updatedEvents);
    };

    const saveSignature = () => {
        if (!selectedVendorId || sigPad.current.isEmpty()) return;

        const signatureData = sigPad.current.getTrimmedCanvas().toDataURL('image/png');

        // Remove existing signature for this vendor in this event if any
        const otherAgreements = agreements.filter(a => a.vendorId !== selectedVendorId);

        updateEventAgreements([...otherAgreements, {
            vendorId: selectedVendorId,
            signature: signatureData,
            signedAt: new Date().toISOString()
        }]);

        alert('Signature saved!');
        sigPad.current.clear();
        // setSelectedVendorId(''); // Keep selected to show confirmation
    };

    const getVendorAgreement = (vid) => agreements.find(a => a.vendorId === vid);

    const downloadAgreement = (agreement) => {
        const vendor = vendors.find(v => v.id === agreement.vendorId);
        const doc = new jsPDF();

        // Setup Font
        doc.setFont("helvetica");

        // Header
        doc.setFontSize(22);
        doc.text("Vendor Agreement", 20, 20);

        doc.setFontSize(12);
        doc.text(`Event: ${event.name}`, 20, 30);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 36);
        doc.text(`Vendor: ${vendor?.name || 'Unknown Vendor'}`, 20, 42);

        // Divider
        doc.setLineWidth(0.5);
        doc.line(20, 45, 190, 45);

        // Body Text (Wrapped)
        doc.setFontSize(10);
        const splitText = doc.splitTextToSize(agreementText, 170);
        doc.text(splitText, 20, 55);

        // Signature Area
        // Calculate Y based on text height, but ensure it doesn't wrap off page (simple check)
        let yPos = 55 + (splitText.length * 5) + 20;
        if (yPos > 250) {
            doc.addPage();
            yPos = 30;
        }

        doc.text("Signed By:", 20, yPos);
        doc.text(vendor?.name || 'Vendor', 20, yPos + 5);

        // Signature Image
        if (agreement.signature) {
            doc.addImage(agreement.signature, 'PNG', 20, yPos + 10, 60, 30);
        }

        doc.text(`Timestamp: ${new Date(agreement.signedAt).toLocaleString()}`, 20, yPos + 45);

        // Save
        doc.save(`${event.name}_Agreement_${vendor?.name || 'Vendor'}.pdf`);
    };

    if (!event) return <div className="page-container" style={{ marginTop: '50px' }}>Loading...</div>;

    const currentVendorAgreement = getVendorAgreement(selectedVendorId);

    return (
        <div className="page-container" style={{ paddingBottom: '120px', marginTop: '50px' }}>
            <header style={{ marginBottom: '24px' }}>
                <h1 className="text-gradient" style={{ fontSize: '28px' }}>Agreements</h1>
                <p style={{ color: 'var(--text-secondary)' }}>{event.name}</p>
            </header>

            <div style={{ display: 'grid', gap: '24px' }}>
                <Card
                    title="Agreement Terms"
                    action={
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)} icon={PenTool}>
                            {isEditing ? 'Done' : 'Edit'}
                        </Button>
                    }
                >
                    {isEditing ? (
                        <textarea
                            style={{
                                width: '100%', minHeight: '150px', background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--glass-border)', color: 'var(--text-primary)',
                                padding: '12px', borderRadius: 'var(--radius-sm)', lineHeight: '1.5'
                            }}
                            value={agreementText}
                            onChange={(e) => setAgreementText(e.target.value)}
                        />
                    ) : (
                        <div style={{
                            fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)',
                            background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)'
                        }}>
                            {agreementText}
                        </div>
                    )}
                </Card>

                <Card title="Helper Sign-off">
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
                            Select Vendor
                        </label>
                        <select
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            style={{
                                width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px'
                            }}
                        >
                            <option value="">-- Select Vendor --</option>
                            {vendors.map(v => {
                                const hasSigned = !!getVendorAgreement(v.id);
                                return (
                                    <option key={v.id} value={v.id}>
                                        {v.name} {hasSigned ? '(Signed)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {currentVendorAgreement && (
                        <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
                            <CheckCircle size={18} />
                            <span style={{ fontSize: '13px' }}>Signed on {new Date(currentVendorAgreement.signedAt).toLocaleDateString()}</span>
                            <div style={{ marginLeft: 'auto' }}>
                                <Button size="sm" variant="outline" icon={Download} onClick={() => downloadAgreement(currentVendorAgreement)}>
                                    Download PDF
                                </Button>
                            </div>
                        </div>
                    )}

                    <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: '4px', overflow: 'hidden' }}>
                        <SignatureCanvas
                            ref={sigPad}
                            penColor="black"
                            canvasProps={{
                                className: 'signature-canvas',
                                style: { width: '100%', height: '200px', display: 'block' }
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                        <Button variant="primary" onClick={saveSignature} icon={Save}>Save Signature</Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AgreementsPage;
