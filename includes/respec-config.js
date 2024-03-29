var respecConfig = {
  specStatus: "CG-DRAFT",
  // if there a publicly available Editor's Draft, this is the link
  edDraftURI: "https://w3c.github.io/p2p-webtransport/",
  shortName: "p2p-webtransport",
  editors: [
    { name: "Peter Thatcher", company: "Microsoft Corporation", w3cid: "68236" },
    { name: "Bernard Aboba", company: "Microsoft Corporation", w3cid: "65611" },
    { name: "Robin Raymond", company: "Microsoft Corporation" }
  ],
  authors: [
  ],
  group: "ortc",
  wgPublicList: "public-ortc",
  github: {
    repoURL: "https://github.com/w3c/p2p-webtransport",
    branch: "master"
  },
  otherLinks: [
    {
      key: "Participate",
      data: [
        {
          value: "Mailing list",
          href: "https://lists.w3.org/Archives/Public/public-ortc/"
        },
        {
          value: "IETF AVTCORE Working Group",
          href: "https://datatracker.ietf.org/wg/avtcore/"
        }
      ]
    }
  ],
  lint: { "no-unused-dfns": false },
  localBiblio: {
    "IANA-STUN-6": {
      "title": "STUN Error Codes",
      "href": "https://www.iana.org/assignments/stun-parameters/stun-parameters.xhtml#stun-parameters-6",
      "publisher": "IANA"
    },
    "ORTC": {
      "title": "Object RTC (ORTC) API for WebRTC",
      "href": "https://w3c.github.io/ortc/",
      "authors": [
        "Robin Raymond",
        "Bernard Aboba",
        "Justin Uberti"
      ],
      "status": "25 January 2021 (work in progress)",
      "publisher": "W3C"
    },
    "RFC9221": {
      "title": "An Unreliable Datagram Extension to QUIC",
      "href": "https://datatracker.ietf.org/doc/html/rfc9221",
      "authors": [
        "T. Pauly",
        "E. Kinnear",
        "D. Schinazi"
      ],
      "status": "March 2022. RFC",
      "publisher": "IETF"
    },
    "RFC9000": {
      "title": "QUIC: A UDP-Based Multiplexed and Secure Transport",
      "href": "https://datatracker.ietf.org/doc/html/rfc9000",
      "authors": [
        "J. Iyengar",
        "M. Thomson"
      ],
      "status": "May 2021. RFC",
      "publisher": "IETF"
    },
    "RFC9443": {
      "title": "Multiplexing Scheme Updates for QUIC",
      "href": "https://datatracker.ietf.org/doc/html/rfc9443",
      "authors": [
        "B. Aboba",
        "G. Salgueiro",
        "C. Perkins"
      ],
      "status": "July 2023. RFC",
      "publisher": "IETF"
    },
    "RFC7675": {
      "title": "Session Traversal Utilities for NAT (STUN) Usage for Consent Freshness",
      "href": "https://datatracker.ietf.org/doc/html/rfc7675",
      "authors": [
        "M. Perumal",
        "D. Wing",
        "R. Ravindranath",
        "T. Reddy",
        "M. Thomson"
      ],
      "status": "October 2015. RFC",
      "publisher": "IETF"
    },
    "RFC8446": {
      "title": "The Transport Layer Security (TLS) Protocol Version 1.3",
      "href": "https://datatracker.ietf.org/doc/html/rfc8446",
      "authors": [
        "E. Rescorla"
      ],
      "status": "August 2018. RFC",
      "publisher": "IETF"
    },
    "RFC8832": {
      "title": "WebRTC Data Channel Establishment Protocol",
      "href": "https://datatracker.ietf.org/doc/html/rfc8832",
      "authors": [
        "R. Jesup",
        "S. Loreto",
        "M. Tuexen"
      ],
      "status": "January 2021. RFC",
      "publisher": "IETF"
    },
    "JSEP": {
      "title": "Javascript Session Establishment Protocol",
      "href": "https://datatracker.ietf.org/doc/html/draft-uberti-rtcweb-rfc8829bis",
      "authors": [
        "J. Uberti",
        "C. Jennings",
        "E. Rescorla"
      ],
      "status": "26 July 2023. Internet Draft (work in progress)",
      "publisher": "IETF"
    },
    "RFC8826": {
      "title": "Security Considerations for WebRTC",
      "href": "https://datatracker.ietf.org/doc/html/rfc8826",
      "authors": [
        "E. Rescorla"
      ],
      "status": "January 2021. RFC",
      "publisher": "IETF"
    },
    "RFC8827": {
      "title": "WebRTC Security Architecture",
      "href": "https://datatracker.ietf.org/doc/html/rfc8827",
      "authors": [
        "E. Rescorla"
      ],
      "status": "January 2021. RFC",
      "publisher": "IETF"
    },
    "WEBRTC-STATS": {
      "title": "Identifiers for WebRTC's Statistics API",
      "href": "https://w3c.github.io/webrtc-stats/",
      "authors": [
        "Harald Alvestrand",
        "Varun Singh"
      ],
      "status": "06 October 2020 (work in progress)",
      "publisher": "W3C"
    }
  }
}
