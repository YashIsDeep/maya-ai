import 'package:flutter/material.dart';

void main() {
  runApp(const MayaApp());
}

/// The Maya client. A placeholder until CL-01 adds the app shell.
class MayaApp extends StatelessWidget {
  const MayaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Maya',
      home: Scaffold(body: Center(child: Text('Maya'))),
    );
  }
}
