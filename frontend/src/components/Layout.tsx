import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout() {
    const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

    const closeMobileNav = React.useCallback(() => {
        setMobileNavOpen(false);
    }, []);

    return (
        <div className="min-h-screen bg-[#FAFAFF] flex">
            <Sidebar isOpen={mobileNavOpen} onClose={closeMobileNav} />

            {mobileNavOpen ? (
                <button
                    type="button"
                    aria-label="Navigation schließen"
                    onClick={closeMobileNav}
                    className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
                />
            ) : null}

            <div className="flex-1 ml-0 lg:ml-64 min-w-0">
                <Topbar onMenuClick={() => setMobileNavOpen(true)} />
                <main className="p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

