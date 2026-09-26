import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maya/main.dart';

void main() {
  testWidgets('MayaApp starts, is titled Maya and shows its name', (tester) async {
    await tester.pumpWidget(const MayaApp());
    expect(tester.widget<MaterialApp>(find.byType(MaterialApp)).title, 'Maya');
    expect(find.text('Maya'), findsOneWidget);
  });
}
