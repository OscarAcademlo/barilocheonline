import 'package:flutter_test/flutter_test.dart';
import 'package:barilocheonline_app/main.dart';

void main() {
  testWidgets('BariRuta Chofer App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const BariRutaChoferApp());
    expect(find.text('BariRuta Chofer'), findsWidgets);
  });
}
